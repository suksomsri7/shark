// SVC D.16 ▸ หน้าแจ้งซ่อมของผู้เช่าหอ · /d/<token>/repair[?r=<repairId>] — สาธารณะ ไม่มี session · ลิงก์เซ็นเดียวกับพอร์ทัล D.9 (หอ 05ค)
//   ด่านทั้งหมดอยู่ใน facade หอ (rate → ลายเซ็น → สัญญา live → งานของสัญญานี้) · ล้มทุกกรณี ⇒ notFound() (X7)
//   ไม่มีไฟล์/ชื่อ/เบอร์ในหน้า · LINE "ซ่อมเสร็จ" ลิงก์มาที่ ?r=<id> เพื่อให้คะแนน
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import DormPortalRepair from "@/components/dorm/portal/DormPortalRepair";
import { loadPortalRepairs } from "@/lib/modules/dorm";
import { portalClientKey } from "@/lib/platform/dorm-portal";
import { rateRepairAction, submitRepairAction } from "./actions";

export const dynamic = "force-dynamic";
// token อยู่ใน URL ⇒ ห้ามจัดทำดัชนี · ไม่ส่ง referrer ออกนอกหน้า
export const metadata: Metadata = { title: "แจ้งซ่อม", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function DormPortalRepairPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string | string[] }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const r = typeof sp.r === "string" && sp.r ? sp.r : null;
  const view = await loadPortalRepairs(token, { r: r ?? null }, { clientKey: portalClientKey(await headers()) });
  if (!view) notFound();
  return (
    <main className="min-h-dvh bg-[#fafafa]">
      <DormPortalRepair view={view} submitAction={submitRepairAction.bind(null, token)} rateAction={rateRepairAction.bind(null, token)} />
    </main>
  );
}
