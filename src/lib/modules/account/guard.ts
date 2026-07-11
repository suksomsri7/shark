import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";

// โหลดระบบบัญชี (feature) + ตรวจว่าเป็นของ tenant + ชนิด ACCOUNT
export async function loadAccountSystem(systemId: string) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId } });
  if (!sys || sys.type !== "ACCOUNT") notFound();
  return { auth, tenantId, systemId, sys, userId: auth.user.id };
}
