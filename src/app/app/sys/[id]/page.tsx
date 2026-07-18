import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { closeDaySummary } from "@/lib/modules/pos/service";
import { CouponHub } from "@/lib/modules/coupon/ui";
import { MeetingContent } from "@/lib/modules/meeting/ui";
import { KanbanContent } from "@/lib/modules/kanban/ui";
import { AccountContent } from "@/lib/modules/account/ui";
import { ChatContent } from "@/lib/modules/chat/ui";
import { CrmHub } from "@/lib/modules/crm/ui";
import { InvHub } from "@/lib/modules/inventory/ui";
import { HrHub } from "@/lib/modules/hr/ui";
import { MarketingHub } from "@/lib/modules/marketing/ui";
import { MemberHub } from "@/lib/modules/member/ui";
import { PointHub } from "@/lib/modules/point/ui";
import { RewardHub } from "@/lib/modules/reward/ui";
import { linkUnitAction, unlinkUnitAction } from "@/lib/actions/systems";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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

  const [links, units] = await Promise.all([
    prisma.appSystemUnit.findMany({ where: { tenantId, systemId: id } }),
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const linkedIds = new Set(links.map((l) => l.unitId));
  const linkedUnits = units.filter((u) => linkedIds.has(u.id));
  const otherUnits = units.filter((u) => !linkedIds.has(u.id));
  const back = `/app/sys/${id}`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc={`ระบบ${def?.label ?? ""}`}
      />

      {/* การเชื่อมต่อ */}
      <Section title="เชื่อมต่อกับระบบ" card>
        {linkedUnits.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            ยังไม่ได้เชื่อม — เชื่อมกับระบบธุรกิจ (จองคิว ฯลฯ) เพื่อให้ทำงานร่วมกัน
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {linkedUnits.map((u) => (
              <ConfirmDialog
                key={u.id}
                triggerLabel={`${u.name} ✕`}
                triggerClassName="rounded-full border px-3 py-1.5 text-xs hover:bg-[color:var(--color-surface-2)]"
                title="ยกเลิกการเชื่อมระบบนี้?"
                detail={`หน่วยงาน "${u.name}" จะถูกตัดการเชื่อมกับระบบนี้`}
                confirmLabel="ยืนยันยกเลิกการเชื่อม"
                danger
                action={unlinkUnitAction}
                fields={{ systemId: id, unitId: u.id, back }}
              />
            ))}
          </div>
        )}
        {otherUnits.length > 0 && (
          <form action={linkUnitAction} className="flex gap-2">
            <input type="hidden" name="systemId" value={id} />
            <input type="hidden" name="back" value={back} />
            <select name="unitId" className="input flex-1">
              {otherUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost text-sm">+ เชื่อม</button>
          </form>
        )}
      </Section>

      {/* เนื้อหาตามประเภท */}
      {sys.type === "MEMBER" && <MemberHub systemId={id} />}
      {sys.type === "POINT" && <PointHub systemId={id} />}
      {sys.type === "POS" && <PosContent systemId={id} tenantId={tenantId} />}
      {sys.type === "REWARD" && <RewardHub systemId={id} tenantId={tenantId} />}
      {sys.type === "COUPON" && <CouponHub systemId={id} tenantId={tenantId} />}
      {sys.type === "MEETING" && <MeetingContent systemId={id} tenantId={tenantId} />}
      {sys.type === "KANBAN" && <KanbanContent systemId={id} tenantId={tenantId} />}
      {sys.type === "ACCOUNT" && <AccountContent systemId={id} tenantId={tenantId} />}
      {sys.type === "CHAT" && <ChatContent systemId={id} tenantId={tenantId} />}
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
