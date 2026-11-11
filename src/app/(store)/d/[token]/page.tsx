// SVC D.9 ▸ หน้าจ่าย/พอร์ทัลผู้เช่าหอ (ภาพ หอ 05 ข) · /d/<token>[?bill=<billId>] — สาธารณะ ไม่มี session
//   ด่านทั้งหมดอยู่ใน facade platform/dorm-portal (rate → ลายเซ็น → สัญญา live → บิลของสัญญา) · ล้มทุกกรณี ⇒ notFound() เนื้อ 404 เดียวกัน (X7)
//   🔴 เส้นทางนี้อยู่ร่วมกับจอลูกค้า POS `/d` (page.tsx คงที่ไม่ชน dynamic segment) · ไม่อ่านคุกกี้ pos_display (มติผู้คุม Q5)
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import DormPortal from "@/components/dorm/portal/DormPortal";
import { loadPortal, portalClientKey } from "@/lib/platform/dorm-portal";
import { submitPortalSlipAction } from "./actions";

export const dynamic = "force-dynamic";
// token อยู่ใน URL ⇒ ห้ามจัดทำดัชนี · ไม่ส่ง referrer ออกนอกหน้า
export const metadata: Metadata = { title: "บิลค่าเช่า", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function DormPortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ bill?: string | string[] }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const bill = typeof sp.bill === "string" && sp.bill ? sp.bill : null;
  const view = await loadPortal(token, { bill }, { clientKey: portalClientKey(await headers()) });
  if (!view) notFound();
  return (
    <main className="min-h-dvh bg-[#fafafa]">
      <DormPortal view={view} token={token} action={submitPortalSlipAction.bind(null, token)} />
    </main>
  );
}
