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
import { ChatInboxSection, chatTabs } from "@/lib/modules/chat/ui";
import { canReadChat } from "@/lib/modules/chat/guard";
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
import { posTabs } from "@/lib/modules/pos/tabs";
import { POS_SALE_STATUS_LABEL } from "@/lib/ui/status-labels";
import { ModuleTabs } from "@/components/module-tabs";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

// หน้า "ระบบ" ประเภท feature (สมาชิก/แต้ม/POS/รางวัล) — เนื้อหา + การเชื่อมต่อ
// 🔴 ระบบ CHAT: หน้านี้ = **กล่องแชทเต็มจอ** แล้ว (คำสั่งข้อ 1 ของเจ้าของ · เดิมเป็นการ์ด 2 ใบ)
//    เลือกห้องด้วย `?c=` · `?err=` มาจาก server action ของแชทที่ redirect กลับมา
export default async function SystemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string; err?: string }>;
}) {
  const { id } = await params;
  const { c, err } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys) notFound();
  const def = systemDef(sys.type);
  const isChat = sys.type === "CHAT";
  // ซ่อนกล่องแชทให้คนที่ไม่มีสิทธิ์อ่าน แล้วบอกตรง ๆ ว่าต้องทำอะไรต่อ
  // (ด่านจริงยังอยู่ที่ `requireChatRead()` ใน ChatInboxSection — ตรงนี้แค่ทำให้ข้อความเป็นภาษาคน)
  const mayReadChat = isChat && canReadChat(auth);

  // เชื่อมระบบย้ายไปจัดการรวมที่ /app/settings/connections แล้ว
  // สาขาเดียว = ซ่อนทั้งหมด (createSystemAutoLink เชื่อมให้แล้ว) · หลายสาขา = โชว์ลิงก์เล็ก ๆ
  const unitCount = await prisma.businessUnit.count({
    where: { tenantId, status: { not: "ARCHIVED" } },
  });

  return (
    <div className={`flex flex-col gap-6 ${isChat ? "max-w-6xl" : "max-w-2xl"}`}>
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
      {isChat && (
        <div className="flex min-w-0 flex-col gap-4">
          <ModuleTabs items={chatTabs(id)} />
          {mayReadChat ? (
            <ChatInboxSection systemId={id} tenantId={tenantId} conversationId={c} err={err} />
          ) : (
            <p className="card text-sm text-[color:var(--color-muted)]">
              บัญชีของคุณยังไม่มีสิทธิ์ดูกล่องแชทลูกค้า — ขอสิทธิ์ “ดูกล่องแชทลูกค้า”
              จากผู้ดูแลร้านได้ที่หน้าผู้ใช้งาน
            </p>
          )}
        </div>
      )}
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
      <ModuleTabs items={posTabs(systemId)} />
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
