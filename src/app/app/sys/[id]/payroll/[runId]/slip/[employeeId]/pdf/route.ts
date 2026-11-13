// HR H3.8 ▸ PDF สลิป (ผู้ดูเงินเดือน · brief R13) — GET → payslipPdfGet (payslip-route.ts) · ด่าน = สมาชิกภาพจริงในฐาน + สาขาประจำ (ใน service) ·
//   ISSUED เท่านั้น (อื่น ๆ = 409 ข้อความคงที่) · 204 สำหรับ rsc/prefetch · HEAD/อื่น ๆ = 405 ก่อนอ่านอะไร ◂
import { getLocale } from "next-intl/server";
import * as session from "@/lib/core/context"; // เซสชันอ่านหลังตอบ rsc/prefetch เท่านั้น
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { payslipPdfGet } from "@/lib/modules/hr/payslip-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; runId: string; employeeId: string }> }) {
  if (req.method !== "GET") return HEAD();
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch")) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { id, runId, employeeId } = await params;
  const auth = await session.requireTenant();
  return payslipPdfGet(req, { tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), runId, employeeId, { locale: await getLocale() });
}

/** HEAD (และเมธอดอื่น) = 405 ก่อนอ่านอะไร */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
