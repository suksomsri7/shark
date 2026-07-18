import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { CouponContent, couponTabs } from "@/lib/modules/coupon/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าย่อย "คูปอง" ของระบบคูปอง — คูปองทั้งหมด + สร้างคูปอง + ทดลองเช็คส่วนลด
export default async function CouponListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "COUPON" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="คูปอง — ทั้งหมด + สร้าง + ทดลองเช็ค" />
      <ModuleTabs items={couponTabs(id)} />
      <CouponContent systemId={id} tenantId={tenantId} />
    </div>
  );
}
