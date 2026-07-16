"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { SystemType, UnitType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requireAuth, setActiveTenant } from "@/lib/core/context";
import { slugify, uniqueTenantSlug } from "@/lib/slug";
import { systemDef } from "@/lib/systems";

const schema = z.object({
  orgName: z.string().trim().min(2, "ชื่อร้านสั้นเกินไป").max(80),
  code: z.string(),
  name: z.string().trim().min(2, "ชื่อระบบสั้นเกินไป").max(80),
});

export type OnboardingState = { status: "idle" } | { status: "error"; message: string };

// สร้างองค์กร + ระบบแรก (ประเภทไหนก็ได้จาก 14 ที่เปิด)
export async function createTenantAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const auth = await requireAuth();
  const parsed = schema.safeParse({
    orgName: formData.get("orgName"),
    code: formData.get("code"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { orgName, code, name } = parsed.data;
  const def = systemDef(code);
  if (!def || def.status !== "available") {
    return { status: "error", message: "ระบบนี้ยังไม่เปิดให้บริการ" };
  }

  const tenant = await prisma.$transaction(async (tx) => {
    const slug = await uniqueTenantSlug(tx, orgName);
    const t = await tx.tenant.create({
      data: { name: orgName, slug, status: "ACTIVE", limits: { maxUnits: 10 } },
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
    if (def.kind === "business") {
      await tx.businessUnit.create({
        data: { tenantId: t.id, type: code as UnitType, name, slug: slugify(name, "main") },
      });
    } else {
      await tx.appSystem.create({ data: { tenantId: t.id, type: code as SystemType, name } });
    }
    return t;
  });

  await setActiveTenant(tenant.id);
  // หลังสร้างกิจการ → พาเข้าบทสัมภาษณ์ DNA ก่อน (ข้ามไปหน้าหลักได้จากในหน้า wizard)
  redirect("/app/dna");
}
