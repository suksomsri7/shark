// POST /api/mobile/push/register {expoToken,platform} + Bearer + X-Tenant-Id → upsert PushDevice
// requireMobile ให้ ctx.tenantId (กิจการ active ตอนลงทะเบียน) · upsert by expoToken: เครื่องย้าย user → แถวย้ายตาม
import { prisma } from "@/lib/core/db";
import { requireMobile, mobileError } from "@/lib/mobile/auth";

export async function POST(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  let body: { expoToken?: unknown; platform?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const expoToken = typeof body.expoToken === "string" ? body.expoToken : "";
  const platform = typeof body.platform === "string" ? body.platform : "";
  if (!expoToken || !platform) return Response.json({ error: "bad_request" }, { status: 400 });
  // PushDevice เป็น global axis (ไม่ผูก tenantId แบบ tenantDb) → ใช้ prisma ตรง · unique expoToken กันแถวซ้ำ
  await prisma.pushDevice.upsert({
    where: { expoToken },
    update: { userId: g.user.id, tenantId: g.ctx.tenantId, platform },
    create: { userId: g.user.id, tenantId: g.ctx.tenantId, expoToken, platform },
  });
  return Response.json({ ok: true }, { status: 200 });
}
