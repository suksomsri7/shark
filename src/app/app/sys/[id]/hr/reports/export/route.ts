// HR H3.9 ▸ ดาวน์โหลดไฟล์รายงาน HR (CSV/XLSX) — GET → reportExportGet (hr/reports-route.ts) · brief R8
//   คำขอที่ Next ดึงเอง (rsc / next-router-prefetch) = 204 ก่อนอ่านผู้ใช้ · ด่าน/ขอบเขต/คอลัมน์อยู่ใน service ทั้งหมด ◂
import { getLocale } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { isRouterFetch } from "@/lib/modules/hr/bank-files/download-route";
import { reportExportGet } from "@/lib/modules/hr/reports-route";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isRouterFetch(req)) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { id } = await params;
  const auth = await requireTenant();
  return reportExportGet(req, { tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), { locale: await getLocale() });
}
