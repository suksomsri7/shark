import { requireAccountPage } from "@/lib/modules/account/guard";
import { OverviewPage } from "@/lib/modules/account/overview-ui";

// "ดูภาพรวมรายรับ" (WO 2.3) — อ้าง DESIGN-SPEC-V2 §6 · mockup f4 (ฝั่งรายจ่าย — หน้านี้คู่ขนานฝั่งรายรับ)
export default async function RevenueOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.doc.view");
  return <OverviewPage systemId={systemId} tenantId={tenantId} side="revenue" searchParams={sp} />;
}
