"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { UnitType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requireAuth, setActiveTenant } from "@/lib/core/context";
import { slugify, uniqueTenantSlug } from "@/lib/slug";

const schema = z.object({
  orgName: z.string().trim().min(2, "ชื่อร้านสั้นเกินไป").max(80),
  unitType: z.nativeEnum(UnitType),
  unitName: z.string().trim().min(2, "ชื่อกิจการสั้นเกินไป").max(80),
});

export type OnboardingState = { status: "idle" } | { status: "error"; message: string };

// โมดูลที่เปิดตามประเภทกิจการ (cross-cutting Member/Point เปิดเสมอ)
const MODULES_BY_TYPE: Record<UnitType, string[]> = {
  HOTEL: ["HOTEL", "POS", "ACCOUNT"],
  RESTAURANT: ["RESTAURANT", "POS", "ACCOUNT"],
  BOOKING: ["BOOKING", "QUEUE", "POS", "ACCOUNT"],
  QUEUE: ["QUEUE"],
  TICKET: ["TICKET", "POS", "ACCOUNT"],
  SHOP: ["POS", "ACCOUNT"],
};

export async function createTenantAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const auth = await requireAuth();
  const parsed = schema.safeParse({
    orgName: formData.get("orgName"),
    unitType: formData.get("unitType"),
    unitName: formData.get("unitName"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { orgName, unitType, unitName } = parsed.data;

  const tenant = await prisma.$transaction(async (tx) => {
    const slug = await uniqueTenantSlug(tx, orgName);
    const t = await tx.tenant.create({
      data: {
        name: orgName,
        slug,
        status: "ACTIVE",
        enabledModules: ["MEMBER", "POINT", ...MODULES_BY_TYPE[unitType]],
        limits: { maxUnits: 5 },
      },
    });
    await tx.membership.create({
      data: {
        userId: auth.user.id,
        tenantId: t.id,
        role: "OWNER",
        unitAccess: ["*"],
        acceptedAt: new Date(),
      },
    });
    await tx.businessUnit.create({
      data: { tenantId: t.id, type: unitType, name: unitName, slug: slugify(unitName, "main") },
    });
    return t;
  });

  await setActiveTenant(tenant.id);
  redirect("/app");
}
