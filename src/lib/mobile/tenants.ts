// สร้างกิจการใหม่ + ผูกคนสร้างเป็น OWNER — single source ของ logic นี้
// (ทั้ง onboarding เว็บ createTenantAction และ POST /api/mobile/tenants เรียกตัวนี้ ห้าม copy สองที่)
// ห้าม import next/* ที่นี่ — ไฟล์นี้ถูก import โดย route ที่ oracle เรียก handler ตรงนอก Next context
import type { Tenant } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { uniqueTenantSlug } from "@/lib/slug";

export async function createTenantForUser(userId: string, name: string): Promise<Tenant> {
  const orgName = name.trim();
  return prisma.$transaction(async (tx) => {
    const slug = await uniqueTenantSlug(tx, orgName);
    const t = await tx.tenant.create({
      data: { name: orgName, slug, status: "ACTIVE", limits: { maxUnits: 10 } },
    });
    await tx.membership.create({
      data: { userId, tenantId: t.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() },
    });
    return t;
  });
}
