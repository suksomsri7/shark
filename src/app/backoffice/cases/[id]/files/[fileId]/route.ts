// GET /backoffice/cases/[id]/files/[fileId] — ทีมงานเปิด/ดาวน์โหลดไฟล์แนบส่วนตัวของเคส (help-cases · 15 พ.ย. 2026)
//   คุกกี้ทีมงาน + SUPER_ADMIN/SUPPORT (เท่ากับสิทธิ์เปิดห้องงานเลขาที่แนบ) · ไฟล์ต้องถูกอ้างในข้อความของเคสนี้ · ไม่ผ่าน = 404 · no-store
//   `?download=1` = บังคับดาวน์โหลด (ปกติ รูป/PDF เปิดในแท็บ · Excel/CSV ดาวน์โหลด)
import { prisma } from "@/lib/core/db";
import { requireBackoffice } from "@/lib/platform/actions";
import { CASE_WRITE_ROLES } from "@/lib/platform/support";
import { caseFileResponse } from "@/lib/support/files";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  await requireBackoffice(CASE_WRITE_ROLES);
  const { id, fileId } = await ctx.params;
  const c = id ? await prisma.supportCase.findUnique({ where: { id }, select: { id: true, tenantId: true } }) : null;
  if (!c) return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return caseFileResponse(c.tenantId, c.id, fileId, { download });
}
