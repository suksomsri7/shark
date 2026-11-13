// HR H3.8 ▸ หนังสือรับรองเงินเดือน (ผู้ผ่านด่านหนังสือรับรอง · brief R13) — GET → salaryCertGet (payslip-route.ts) ·
//   PDF สร้างใหม่จากเนื้อหาที่แช่แข็งหลังตรวจ sha · ชื่อไฟล์ = <เลขที่>.pdf · 204 สำหรับ rsc/prefetch · HEAD/อื่น ๆ = 405 ◂
import { getLocale } from "next-intl/server";
import * as session from "@/lib/core/context"; // เซสชันอ่านหลังตอบ rsc/prefetch เท่านั้น
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { salaryCertGet } from "@/lib/modules/hr/payslip-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; certId: string }> }) {
  if (req.method !== "GET") return HEAD();
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch")) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { id, certId } = await params;
  const auth = await session.requireTenant();
  return salaryCertGet(req, { tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), certId, { locale: await getLocale() });
}

/** HEAD (และเมธอดอื่น) = 405 ก่อนอ่านอะไร */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
