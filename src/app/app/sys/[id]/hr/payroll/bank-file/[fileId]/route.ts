// HR H3.5 ▸ ดาวน์โหลดไฟล์โอนเงินเดือน (brief R14 · R11) — GET → downloadBankFile (ผ่าน bank-files/download-route.ts#bankFileGet)
//   ไม่เก็บไบต์ไว้ที่ไหน: service สร้างใหม่ด้วยตัวเลือก + เวลาเดิมของใบกำกับแล้วเทียบ sha (ข้อมูลเปลี่ยน/หมดอายุ/รอบถูกกลับ/รูปแบบปิด = ข้อความคงที่ ไม่มีไบต์)
//   HR H3.5 fix r1 ▸ F5: คำขอที่ Next ดึงเอง (หัว rsc / next-router-prefetch) = 204 ก่อนอ่านผู้ใช้ — ไม่เรียก service ·
//   หัวตอบ attachment · no-store · nosniff อยู่ใน bankFileGet ◂
import { getLocale } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { bankFileGet, isRouterFetch, notGet, notGetResponse } from "@/lib/modules/hr/bank-files/download-route"; // HR H3.9 ▸ notGet ◂

export async function GET(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  if (notGet(req)) return notGetResponse(); // HR H3.9 fix r1 F2a ▸ HEAD = 405 ก่อนอ่านผู้ใช้ ◂
  if (isRouterFetch(req)) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const { id, fileId } = await params;
  const auth = await requireTenant();
  // ระบบต้องเป็นระบบ HR ของร้านนี้ + ผู้ดูผ่านด่าน — service ตรวจทั้งคู่ (ไม่ผ่าน = ข้อความ "ไม่พบ" เดียวกัน)
  return bankFileGet(req, { tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), fileId, { locale: await getLocale() });
}
