// HR H3.9 ▸ ตรรกะของ GET ไฟล์รายงาน (route.ts ต่อแค่ requireTenant + hrViewerOf · ข้อสอบเรียกตรงได้ ไม่ต้องมีคุกกี้) — brief R8
//   🔴 คำขอที่ Next ดึงเอง (หัว rsc / next-router-prefetch) = 204 ก่อนอ่านอะไรทั้งสิ้น (กติกาเดียวกับไฟล์โอน H3.5)
//   ไม่ผ่าน = ข้อความคงที่ · text/plain · ไม่มีไบต์ไฟล์ · 404 ไม่พบ/ไม่มีสิทธิ์ · 400 อินพุต · 409 สูตร/อักขระ/ข้อมูลมากเกิน
//   สำเร็จ = attachment · no-store · nosniff · query: report period format(csv|xlsx) unit ◂
import { isRouterFetch, notGet, notGetResponse, safeFileName } from "./bank-files/download-route";
import { exportReport, type ReportViewer } from "./reports";
import { reportTextFor } from "./reports-rules";

type Ctx = { tenantId: string; systemId: string };
const BASE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;
const STATUS_OF: Record<string, number> = { NO: 404, INPUT: 400, FORMULA: 409, ENCODING: 409, LIMIT: 409 };

export async function reportExportGet(req: Request, ctx: Ctx, viewer: ReportViewer, opts?: { locale?: string | null }): Promise<Response> {
  if (notGet(req)) return notGetResponse(); // fix r1 F2a: HEAD ฯลฯ = 405 ก่อนอ่านอะไร (ไม่สร้างไฟล์ · ไม่ลงประวัติ)
  if (isRouterFetch(req)) return new Response(null, { status: 204, headers: BASE_HEADERS });
  const refuse = (code: string, reason: string) => new Response(reason, { status: STATUS_OF[code] ?? 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...BASE_HEADERS } });
  let q: URLSearchParams;
  try {
    q = new URL(req.url).searchParams;
  } catch {
    return refuse("INPUT", reportTextFor(opts?.locale).input);
  }
  const r = await exportReport(ctx, viewer, { report: q.get("report"), period: q.get("period"), unitId: q.get("unit") || undefined, format: q.get("format") }, { locale: opts?.locale ?? null });
  if (!r.ok) return refuse(r.code, r.reason);
  return new Response(Buffer.from(r.bytes), {
    status: 200,
    headers: {
      "Content-Type": r.contentType,
      "Content-Disposition": `attachment; filename="${safeFileName(r.fileName)}"`,
      "Content-Length": String(r.bytes.length),
      ...BASE_HEADERS,
    },
  });
}
// ◂ HR H3.9
