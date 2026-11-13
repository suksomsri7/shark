// HR H3.6 ▸ ดาวน์โหลดหนังสือรับรอง 50 ทวิ ของพนักงาน (brief R14 · R11) — GET → downloadTaxCertificate (ผ่าน filings/download-route.ts#taxCertGet)
//   PDF สร้างใหม่จากเนื้อหาที่แช่แข็งไว้หลังตรวจ sha · ชื่อไฟล์ = <เลขที่>.pdf · 204 สำหรับ rsc/prefetch · attachment · no-store · nosniff ◂
import { getLocale } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { isRouterFetch } from "@/lib/modules/hr/bank-files/download-route";
import { taxCertGet } from "@/lib/modules/hr/filings/download-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; certId: string }> }) {
  if (isRouterFetch(req)) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { id, certId } = await params;
  const auth = await requireTenant();
  return taxCertGet(req, { tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), certId, { locale: await getLocale() });
}
