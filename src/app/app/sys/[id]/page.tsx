import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { closeDaySummary } from "@/lib/modules/pos/service";
import { CouponHub } from "@/lib/modules/coupon/ui";
import { MeetingHub } from "@/lib/modules/meeting/ui";
import { KanbanHub } from "@/lib/modules/kanban/ui";
import { AccountContent } from "@/lib/modules/account/ui";
import { ChatHub } from "@/lib/modules/chat/ui";
import { CrmHub } from "@/lib/modules/crm/ui";
import { InvHub } from "@/lib/modules/inventory/ui";
import { HrHub } from "@/lib/modules/hr/ui";
import { MarketingHub } from "@/lib/modules/marketing/ui";
import { MemberHub } from "@/lib/modules/member/ui";
import { PointHub } from "@/lib/modules/point/ui";
import { RewardHub } from "@/lib/modules/reward/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { StatusChip } from "@/components/ui/StatusChip";
import { MoneyText } from "@/components/ui/MoneyText";
import { POS_SALE_STATUS_LABEL } from "@/lib/ui/status-labels";
import { ModuleTabs } from "@/components/module-tabs";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

// หน้า "ระบบ" ประเภท feature (สมาชิก/แต้ม/POS/รางวัล) — เนื้อหา + การเชื่อมต่อ
export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys) notFound();
  const def = systemDef(sys.type);

  // เชื่อมระบบย้ายไปจัดการรวมที่ /app/settings/connections แล้ว
  // สาขาเดียว = ซ่อนทั้งหมด (createSystemAutoLink เชื่อมให้แล้ว) · หลายสาขา = โชว์ลิงก์เล็ก ๆ
  const unitCount = await prisma.businessUnit.count({
    where: { tenantId, status: { not: "ARCHIVED" } },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc={`ระบบ${def?.label ?? ""}`}
      />

      {unitCount > 1 && (
        <Link
          href="/app/settings/connections"
          className="text-sm text-[color:var(--color-accent)]"
        >
          จัดการการเชื่อมระบบ →
        </Link>
      )}

      {/* เนื้อหาตามประเภท */}
      {sys.type === "MEMBER" && <MemberHub systemId={id} />}
      {sys.type === "POINT" && <PointHub systemId={id} />}
      {sys.type === "POS" && <PosContent systemId={id} tenantId={tenantId} />}
      {sys.type === "REWARD" && <RewardHub systemId={id} tenantId={tenantId} />}
      {sys.type === "COUPON" && <CouponHub systemId={id} tenantId={tenantId} />}
      {sys.type === "MEETING" && <MeetingHub systemId={id} tenantId={tenantId} />}
      {sys.type === "KANBAN" && <KanbanHub systemId={id} tenantId={tenantId} />}
      {sys.type === "ACCOUNT" && <AccountContent systemId={id} tenantId={tenantId} />}
      {sys.type === "CHAT" && <ChatHub systemId={id} tenantId={tenantId} />}
      {sys.type === "CRM" && <CrmHub systemId={id} />}
      {sys.type === "INVENTORY" && <InvHub systemId={id} />}
      {sys.type === "HR" && <HrHub systemId={id} />}
      {sys.type === "MARKETING" && <MarketingHub systemId={id} />}
    </div>
  );
}

async function PosContent({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const [sales, paidAll, today] = await Promise.all([
    prisma.posSale.findMany({
      where: { tenantId, systemId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.posSale.aggregate({
      where: { tenantId, systemId, status: "PAID" },
      _sum: { grandTotalSatang: true },
      _count: true,
    }),
    closeDaySummary({ tenantId, systemId }),
  ]);
  const total = paidAll._sum.grandTotalSatang ?? 0;
  return (
    <>
      <ModuleTabs
        items={[
          { href: `/app/sys/${systemId}`, label: "ภาพรวม" },
          { href: `/app/sys/${systemId}/pos/register`, label: "ขาย" },
          { href: `/app/sys/${systemId}/pos/products`, label: "สินค้า/ราคา" },
          { href: `/app/sys/${systemId}/pos/sales`, label: "ประวัติบิล" },
          { href: `/app/sys/${systemId}/pos/close`, label: "ปิดวัน" },
        ]}
      />
      <Link
        href={`/app/sys/${systemId}/pos/register`}
        className="btn btn-primary min-h-[52px] text-base"
      >
        เปิดหน้าขาย
      </Link>
      <Section
        title="ยอดวันนี้"
        actions={<Link href={`/app/sys/${systemId}/pos/close`} className="text-sm text-[color:var(--color-accent)]">ปิดวัน →</Link>}
      >
        <div className="text-sm text-[color:var(--color-muted)]">
          <MoneyText satang={today.netSalesSatang} /> · {today.billCount} บิล
          {today.voidCount > 0 && ` · ยกเลิก ${today.voidCount}`}
        </div>
      </Section>
      <Section title="ยอดขายรวม">
        <div className="text-sm text-[color:var(--color-muted)]">
          รวม <MoneyText satang={total} /> · {paidAll._count} บิลที่ชำระแล้ว
        </div>
      </Section>
      <Section
        title="บิลล่าสุด"
        actions={<Link href={`/app/sys/${systemId}/pos/sales`} className="text-sm text-[color:var(--color-accent)]">ดูทั้งหมด →</Link>}
      >
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
    </>
  );
}
