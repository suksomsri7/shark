// GET /api/mobile/tenants + Bearer → รายชื่อกิจการของ user
// POST /api/mobile/tenants {name} + Bearer → สร้างกิจการใหม่ (OWNER + acceptedAt + unitAccess ["*"]) → {tenantId}
// ใช้ mobileUser (ไม่ใช่ requireMobile) เพราะตอนสร้างกิจการแรกยังไม่มี X-Tenant-Id ให้ตรวจ
import { prisma } from "@/lib/core/db";
import { mobileUser } from "@/lib/mobile/auth";
import { createTenantForUser } from "@/lib/mobile/tenants";

export async function GET(req: Request): Promise<Response> {
  const user = await mobileUser(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, acceptedAt: { not: null } },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
  return Response.json(
    { tenants: memberships.map((m) => ({ tenantId: m.tenantId, name: m.tenant.name, role: m.role })) },
    { status: 200 },
  );
}

export async function POST(req: Request): Promise<Response> {
  const user = await mobileUser(req);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "ต้องระบุชื่อกิจการ" }, { status: 400 });
  const tenant = await createTenantForUser(user.id, name);
  return Response.json({ tenantId: tenant.id }, { status: 200 });
}
