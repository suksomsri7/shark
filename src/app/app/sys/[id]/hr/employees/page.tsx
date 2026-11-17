import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrViewerOf, requireHrPage } from "@/lib/modules/hr/privacy"; // HR PRIV-3 ▸ ด่านหน้าตามบทบาท ◂
import { HrEmployeesSection, hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "พนักงาน" ของระบบ HR — รายชื่อพนักงาน + เพิ่มพนักงาน
export default async function HrEmployeesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ unit?: string }> }) {
  const { id } = await params;
  const { unit } = await searchParams; // HR H1.1 ▸ ชิปกรองสาขา (?unit=<id> | none) ◂
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  if (!requireHrPage(hrViewerOf(auth), "register")) notFound(); // HR PRIV-3 ▸ ไม่มีสิทธิ์หน้านี้ = 404 เดียวกับรหัสระบบที่ไม่มีอยู่ (ก่อนอ่านข้อมูลใด ๆ) ◂
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="พนักงาน — รายชื่อ + เพิ่มพนักงาน" />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      <HrEmployeesSection systemId={id} unit={typeof unit === "string" ? unit : undefined} />
    </div>
  );
}
