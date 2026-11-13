// HR H3.8 ▸ หนังสือรับรองเงินเดือนของฉัน (brief R13) — GET → mySalaryCertGet (payslip-route.ts) · ใบที่ออกแล้วและยังไม่ถูกยกเลิกของตัวเองเท่านั้น ·
//   อื่น ๆ = ข้อความ "ไม่พบ" เดียวกัน · 204 สำหรับ rsc/prefetch · HEAD/อื่น ๆ = 405 ◂
import { getLocale } from "next-intl/server";
import * as session from "@/lib/core/context"; // เซสชันอ่านหลังตอบ rsc/prefetch เท่านั้น
import { selfActorOf } from "@/lib/modules/hr/self";
import { mySalaryCertGet } from "@/lib/modules/hr/payslip-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ certId: string }> }) {
  if (req.method !== "GET") return HEAD();
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch")) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { certId } = await params;
  const auth = await session.requireTenant();
  return mySalaryCertGet(req, selfActorOf(auth), certId, { locale: await getLocale() });
}

/** HEAD (และเมธอดอื่น) = 405 ก่อนอ่านอะไร */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
