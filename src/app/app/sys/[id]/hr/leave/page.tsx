import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrViewerOf, requireHrPage } from "@/lib/modules/hr/privacy"; // HR PRIV-3 ▸ ด่านหน้าตามบทบาท ◂
import { HrLeaveSection, hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { HrOtSection } from "@/lib/modules/hr/ui"; // HR H2.9 ▸ คำขอ OT (ภาพ 05) ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "ใบลา" ของระบบ HR — ใบลารออนุมัติ + ยื่นใบลา + ประวัติการลา
export default async function HrLeavePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  if (!requireHrPage(hrViewerOf(auth), "leave")) notFound(); // HR PRIV-3 ▸ ไม่มีสิทธิ์หน้านี้ = 404 เดียวกับรหัสระบบที่ไม่มีอยู่ (ก่อนอ่านข้อมูลใด ๆ) ◂
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ใบลา — อนุมัติ/ยื่นใบลา" />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      <HrLeaveSection systemId={id} />
      <HrOtSection systemId={id} /> {/* HR H2.9 ◂ */}
    </div>
  );
}
