import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership, posSalesScope, posSaleWhere } from "@/lib/modules/pos/access";
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
  // HF-POS-PAGES: เดิมไม่ตรวจสิทธิ์เลย — ต้องขายได้ที่สาขาใดสาขาหนึ่ง · คนจำกัดสาขาเห็นเฉพาะบิลสาขาของตัวเอง
  const scope = posSalesScope(posMembership(auth.active));
  if (!scope) notFound();
  const def = systemDef(sys.type);

  const sales = await prisma.posSale.findMany({
    where: posSaleWhere(tenantId, id, scope),
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // POS P1.8 ▸ R3: บิลขายที่นับยอด (PAID + คืนครบ) − ใบคืนเงิน (docType REFUND) ในรายการเดียวกัน ◂
  const paid = sales.filter((s) => s.docType === "SALE" && s.status !== "VOIDED");
  const total = paid.reduce((s, x) => s + x.grandTotalSatang, 0) - sales.filter((s) => s.docType === "REFUND").reduce((s, x) => s + x.grandTotalSatang, 0);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ประวัติการขาย" />
      <ModuleTabs
        items={posTabs(id)}
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
                {s.receiptNo} · <MoneyText satang={s.docType === "REFUND" ? -s.grandTotalSatang : s.grandTotalSatang} />
              </span>
            ),
            trailing: (
              <span className="flex items-center gap-2">
                {(s.status !== "PAID" || s.docType === "REFUND") && (
                  <StatusChip value={s.docType === "REFUND" ? "REFUND" : s.status} map={POS_SALE_STATUS_LABEL} tone="danger" />
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
