// GET /api/v1/me — ข้อมูลร้านของคีย์ที่ใช้เรียก (WO-0061)
import { prisma } from "@/lib/core/db";
import { apiJson, authenticateApiRequest } from "@/lib/api-keys/route-auth";

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;
  // Tenant = global-scope (ไม่ผูก tenantId) → อ่านตรงด้วย prisma ตามสัญญา db.ts
  const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId } });
  if (!tenant) return apiJson({ error: "ไม่พบร้าน" }, 404);
  return apiJson({ tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } }, 200);
}
