// GET /api/mobile/secretary/support/cases/[id]/files/[fileId] — ไบต์ของไฟล์แนบส่วนตัวในเคส (help-cases · 15 พ.ย. 2026)
//   สิทธิ์ = เห็นเคส (`visibleCase` · OWNER ทั้งร้าน · คนอื่นเฉพาะที่ตัวเองเปิด) **และ** ไฟล์ถูกอ้างในข้อความของเคสนี้ (`caseFileResponse`)
//   ไม่ผ่าน/ไม่มี = 404 (ไม่บอกว่ารหัสมีจริง) · 120 ครั้ง/นาที · `Cache-Control: private, no-store`
import { caseFileResponse } from "@/lib/support/files";
import { gate, idParam, withRateLimit, type RouteCtx, withErrors } from "../../../../../_shared";
import { visibleCase } from "../../../../_case";

async function GET_(req: Request, ctx: RouteCtx<"id" | "fileId">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "support-files", 120);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  const fileId = await idParam(ctx, "fileId");
  const c = id ? await visibleCase(a.c, id) : null;
  if (!c || !fileId) return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  return caseFileResponse(a.c.tenantId, c.id, fileId);
}

export const GET = withErrors("secretary/support/cases/[id]/files/[fileId] GET", GET_);
