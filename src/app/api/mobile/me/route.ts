// GET /api/mobile/me + Bearer (ไม่ต้องมี X-Tenant-Id — ยังไม่เลือกกิจการ) → user + รายชื่อกิจการ
// ใช้ mobileUser (แค่ยืนยันตัวตน) ไม่ใช่ requireMobile ที่บังคับ X-Tenant-Id
import { prisma } from "@/lib/core/db";
import { mobileUser } from "@/lib/mobile/auth";

export async function GET(req: Request): Promise<Response> {
  const user = await mobileUser(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  // เฉพาะ membership ที่ acceptedAt แล้ว (คำเชิญที่ตอบรับ) — Membership คือ global axis อ่าน prisma ตรงได้
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, acceptedAt: { not: null } },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
  return Response.json(
    {
      user: { id: user.id, email: user.email, name: user.name },
      memberships: memberships.map((m) => ({ tenantId: m.tenantId, name: m.tenant.name, role: m.role })),
    },
    { status: 200 },
  );
}
