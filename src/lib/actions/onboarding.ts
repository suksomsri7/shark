"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { requireAuth, setActiveTenant } from "@/lib/core/context";
import { uniqueTenantSlug } from "@/lib/slug";

const schema = z.object({
  orgName: z.string().trim().min(2, "ชื่อร้านสั้นเกินไป").max(80),
});

export type OnboardingState = { status: "idle" } | { status: "error"; message: string };

// สร้างองค์กรเปล่า แล้วพาเข้าบทสัมภาษณ์ DNA — AI เป็นคนถามแล้วประกอบระบบให้
// (เลิกให้ user เลือกระบบเองจากตาราง — นั่นคือหัวใจของวิชัน "ไม่ต้องเรียนซอฟต์แวร์")
export async function createTenantAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const auth = await requireAuth();
  const parsed = schema.safeParse({ orgName: formData.get("orgName") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { orgName } = parsed.data;

  const tenant = await prisma.$transaction(async (tx) => {
    const slug = await uniqueTenantSlug(tx, orgName);
    const t = await tx.tenant.create({
      data: { name: orgName, slug, status: "ACTIVE", limits: { maxUnits: 10 } },
    });
    await tx.membership.create({
      data: { userId: auth.user.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() },
    });
    return t;
  });

  await setActiveTenant(tenant.id);
  redirect("/app/dna"); // → AI สัมภาษณ์ → ประกอบระบบ (ข้ามไปเลือกเองได้จากในหน้า wizard)
}
