// HR H3.6 ▸ หนังสือรับรอง 50 ทวิ ของตัวเอง (brief R9 · R14) — GET → downloadMyTaxCertificate (ผ่าน filings/download-route.ts#myTaxCertGet)
//   ผู้ใช้ → พนักงานของตัวเอง (H2.10 resolveSelf) · ใบที่ยังไม่ยกเลิกของตัวเองเท่านั้น · อื่น ๆ = ข้อความ "ไม่พบ" เดียวกัน · 204 สำหรับ rsc/prefetch ◂
import { getLocale } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { selfActorOf } from "@/lib/modules/hr/self";
import { myTaxCertGet } from "@/lib/modules/hr/filings/download-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ certId: string }> }) {
  if (req.method !== "GET") return HEAD(); // fix r1 F9
  if (req.headers.has("rsc") || req.headers.has("next-router-prefetch")) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { certId } = await params;
  const auth = await requireTenant();
  return myTaxCertGet(req, selfActorOf(auth), certId, { locale: await getLocale() });
}

/** fix r1 F9: HEAD (และเมธอดอื่น) = 405 ก่อนอ่านอะไร — ไม่สร้างไฟล์ ไม่ลงประวัติ (Next ตอบ HEAD ด้วย GET ถ้าไม่ประกาศ) */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
