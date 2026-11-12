import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { HrKioskSection, hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { canRunKiosk } from "@/lib/modules/hr/clock-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "จอลงเวลา" ของระบบ HR — เปิดค้างบนแท็บเล็ตหน้าร้าน พนักงานกดลงเวลาเองด้วย PIN · ผู้เปิดได้ = canRunKiosk (VIS-1 C)
export default async function HrKioskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  // VIS-1 C ▸ รายชื่อ + ตำแหน่ง + แป้น PIN เปิดเฉพาะผู้ใช้จอ (OWNER · MANAGER · คีย์ลงเวลา) — คนอื่น 404 เหมือนหน้าลงเวลา (ด่านเดียวกับ kioskClockAction) ◂
  if (!canRunKiosk(hrViewerOf(auth))) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="จอลงเวลา — พนักงานกดเองด้วย PIN" />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      <HrKioskSection systemId={id} />
    </div>
  );
}
