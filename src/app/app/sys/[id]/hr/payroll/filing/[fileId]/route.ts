// HR H3.6 ▸ ดาวน์โหลดไฟล์ ภ.ง.ด.1 / ภ.ง.ด.1ก / สปส.1-10 (brief R14 · R10) — GET → downloadFiling (ผ่าน filings/download-route.ts#filingFileGet)
//   ไม่เก็บไบต์: service สร้างใหม่ด้วยตัวเลือกเดิมแล้วเทียบ sha (ข้อมูลเปลี่ยน/หมดอายุ/รอบถูกกลับ = ข้อความคงที่ ไม่มีไบต์) ·
//   คำขอที่ Next ดึงเอง (หัว rsc / next-router-prefetch) = 204 ก่อนอ่านผู้ใช้ · attachment · no-store · nosniff อยู่ใน helper ◂
import { getLocale } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { isRouterFetch } from "@/lib/modules/hr/bank-files/download-route";
import { filingFileGet } from "@/lib/modules/hr/filings/download-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  if (isRouterFetch(req)) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { id, fileId } = await params;
  const auth = await requireTenant();
  // ระบบต้องเป็นระบบ HR ของร้านนี้ + ผู้ดูผ่านด่าน — service ตรวจทั้งคู่ (ไม่ผ่าน = ข้อความ "ไม่พบ" เดียวกัน)
  return filingFileGet(req, { tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), fileId, { locale: await getLocale() });
}
