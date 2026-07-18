import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModuleTabs } from "@/components/module-tabs";
import { POS_SALE_STATUS_LABEL } from "@/lib/ui/status-labels";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

// ฟังก์ชันย่อย "ประวัติบิล" ของระบบ POS (แตกออกจากหน้าภาพรวม)
export default async function PosSalesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  const sales = await prisma.posSale.findMany({
    where: { tenantId, systemId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const paid = sales.filter((s) => s.status === "PAID");
  const total = paid.reduce((s, x) => s + x.grandTotalSatang, 0);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ประวัติการขาย" />
      <ModuleTabs
        items={[
          { href: `/app/sys/${id}`, label: "ภาพรวม" },
          { href: `/app/sys/${id}/pos/register`, label: "ขาย" },
          { href: `/app/sys/${id}/pos/sales`, label: "ประวัติบิล" },
          { href: `/app/sys/${id}/pos/close`, label: "ปิดวัน" },
        ]}
      />

      <Section title="ประวัติบิล">
        <div className="text-sm text-[color:var(--color-muted)]">
          รวม <MoneyText satang={total} /> · {paid.length} บิล (ล่าสุด 100 รายการ)
        </div>
        <DataList
          items={sales.map((s) => ({
            key: s.id,
            primary: (
              <span>
                {s.receiptNo} · <MoneyText satang={s.grandTotalSatang} />
              </span>
            ),
            trailing: (
              <span className="flex items-center gap-2">
                {s.status !== "PAID" && (
                  <StatusChip value={s.status} map={POS_SALE_STATUS_LABEL} tone="danger" />
                )}
                <span className="text-xs text-[color:var(--color-muted)]">{fmt(s.createdAt)}</span>
              </span>
            ),
          }))}
          empty="ยังไม่มีการขาย — บิลจะแสดงที่นี่เมื่อขายผ่านระบบที่เชื่อมไว้"
        />
      </Section>
    </div>
  );
}
