import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { PayrollSection } from "@/lib/modules/hr/payroll-ui";
import { StockChargeSection } from "@/lib/modules/hr/stock-charge-ui"; // HR H4.6 ▸ หักค่าของ/ค่าเสียหาย ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "เงินเดือน" ของระบบ HR — โปรไฟล์เงินเดือน + รอบจ่าย + สลิป
// 🔒 PayrollSection มี canViewPayroll guard ในตัว (PDPA — เห็นเฉพาะ OWNER/ผู้มีสิทธิ์)
export default async function HrPayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>; // HR H4.6 ▸ ?stock=<รหัสผล> · ?stockq=<ค้นสินค้า> · ?stockinv=<คลังที่เลือก> ◂
}) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="เงินเดือน — โปรไฟล์ + รอบจ่าย + สลิป" />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      <PayrollSection systemId={id} />
      {/* HR H4.6 ▸ ฟอร์ม = ผู้ถือคีย์ยื่นรายการ · รายการ/ยอด = ผู้ดูเงินเดือน (ด่านในตัว) ◂ */}
      <StockChargeSection systemId={id} msg={one(sp.stock)} q={one(sp.stockq)} inv={one(sp.stockinv)} />
    </div>
  );
}
