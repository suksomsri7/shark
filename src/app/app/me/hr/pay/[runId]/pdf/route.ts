// HR H3.8 ▸ PDF สลิปของฉัน (brief R13) — GET → myPayslipPdfGet (payslip-route.ts) · พนักงานจากเซสชันเท่านั้น (resolveSelf) · ISSUED เท่านั้น ·
//   204 สำหรับ rsc/prefetch · HEAD/อื่น ๆ = 405 ก่อนอ่านอะไร · attachment · no-store · nosniff ◂
import { getLocale } from "next-intl/server";
import * as session from "@/lib/core/context"; // เซสชันอ่านหลังตอบ rsc/prefetch เท่านั้น
import { selfActorOf } from "@/lib/modules/hr/self";
import { myPayslipPdfGet } from "@/lib/modules/hr/payslip-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  if (req.method !== "GET") return HEAD();
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch")) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { runId } = await params;
  const auth = await session.requireTenant();
  return myPayslipPdfGet(req, selfActorOf(auth), runId, { locale: await getLocale() });
}

/** HEAD (และเมธอดอื่น) = 405 ก่อนอ่านอะไร — ไม่สร้างไฟล์ ไม่ลงประวัติ (Next ตอบ HEAD ด้วย GET ถ้าไม่ประกาศ) */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
