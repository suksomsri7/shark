import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { pointTabs } from "@/lib/modules/point/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

// หน้าย่อย "รายการแต้ม" ของระบบแต้ม — ประวัติการสะสม/ใช้แต้มล่าสุด
export default async function PointLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "POINT" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  const ledger = await prisma.pointLedger.findMany({
    where: { systemId: id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="รายการแต้ม — ประวัติล่าสุด" />
      <ModuleTabs items={pointTabs(id)} />
      <Section title="รายการแต้มล่าสุด">
        <DataList
          items={ledger.map((l) => ({
            key: l.id,
            primary: `${l.delta > 0 ? "+" : ""}${l.delta} แต้ม · ${l.reason ?? l.type}`,
            trailing: <span className="text-xs text-[color:var(--color-muted)]">{fmt(l.createdAt)}</span>,
          }))}
          empty="ยังไม่มีรายการแต้ม — จะบันทึกอัตโนมัติเมื่อลูกค้าสะสมแต้ม"
        />
      </Section>
    </div>
  );
}
