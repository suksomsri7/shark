import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrViewerOf, requireHrPage } from "@/lib/modules/hr/privacy"; // HR PRIV-3 ▸ ด่านหน้าตามบทบาท ◂
import { HrEmployeesSection, hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "พนักงาน" ของระบบ HR — รายชื่อพนักงาน + เพิ่มพนักงาน
export default async function HrEmployeesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { // HR VIS-5c ▸ + q · tab · dept · ended · page · emp · add ◂
  const { id } = await params;
  const sp = await searchParams; // HR H1.1 ▸ ชิปกรองสาขา (?unit=<id> | none) ◂ · HR VIS-5c ▸ ค่าตัวกรองของทะเบียน (ค่าเดี่ยวเท่านั้น) ◂
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined); // HR VIS-5c ◂
  const unit = one("unit"); // HR VIS-5c ◂
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  if (!requireHrPage(hrViewerOf(auth), "register")) notFound(); // HR PRIV-3 ▸ ไม่มีสิทธิ์หน้านี้ = 404 เดียวกับรหัสระบบที่ไม่มีอยู่ (ก่อนอ่านข้อมูลใด ๆ) ◂
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-7xl flex-col gap-5">{/* HR VIS-5c ▸ ภาพ 02 ตาราง 9 คอลัมน์ + แผงด้านขวา ⇒ กว้างเท่าหน้าภาพรวม (max-w-7xl) ◂ */}
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} />{/* HR VIS-5c ▸ คำอธิบายย้ายเข้าหัวของทะเบียน (hr.people) ◂ */}
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} wrap />{/* HR VIS-5c ▸ แท็บขึ้นบรรทัดใหม่บนจอ ≥ md (เหมือนหน้าภาพรวม) ◂ */}
      <HrEmployeesSection systemId={id} unit={unit} query={{ q: one("q"), tab: one("tab"), dept: one("dept"), ended: one("ended"), page: one("page"), emp: one("emp"), add: one("add") }} />{/* HR VIS-5c ◂ */}
    </div>
  );
}
