import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrTabs } from "@/lib/modules/hr/ui";
import { PayrollSection } from "@/lib/modules/hr/payroll-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "เงินเดือน" ของระบบ HR — โปรไฟล์เงินเดือน + รอบจ่าย + สลิป
// 🔒 PayrollSection มี canViewPayroll guard ในตัว (PDPA — เห็นเฉพาะ OWNER/ผู้มีสิทธิ์)
export default async function HrPayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="เงินเดือน — โปรไฟล์ + รอบจ่าย + สลิป" />
      <ModuleTabs items={hrTabs(id)} />
      <PayrollSection systemId={id} />
    </div>
  );
}
