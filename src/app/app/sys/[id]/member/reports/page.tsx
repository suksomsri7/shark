import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canManageSettings, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { cohort, getReportSchedule, overview, points, promotions, rfm, sources, tiers } from "@/lib/modules/member/reports";
import { isReportTab, type ReportTab } from "@/lib/modules/member/reports-shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { ReportTabs } from "@/components/member/ReportTabs";
import { ReportKpis, ReportNewMembersChart } from "@/components/member/ReportOverview";
import { ReportRfmGrid, ReportRfmTable } from "@/components/member/ReportRfmGrid";
import { ReportPointsCard, ReportPromotionsCard, ReportTiersCard } from "@/components/member/ReportCards";
import { ReportCohortTable, ReportSourcesTable } from "@/components/member/ReportTables";
import { ReportActions } from "@/components/member/ReportActions";

// หน้า "ระบบสมาชิก › รายงาน" (M3.8 · ภาพ ledger/design-member/25-reports.png)
// `/app/sys/{id}/member/reports?tab=overview|rfm|tiers|points|promotions|sources|cohort`
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + ต้องมีสิทธิ์ `member.report.view` → ไม่งั้น notFound() (404-not-403 §6.4)
// 🔴 แท็บภาพรวม = แดชบอร์ดตามภาพ 25 (KPI 6 · สมาชิกใหม่ 12 เดือน · RFM 3×3 · การ์ดระดับ/แต้ม/โปรโมชัน)
//    แท็บอื่นโหลดเฉพาะรายงานของแท็บนั้น (ตารางเต็ม)
// 🔴 ปุ่ม "ตั้งเวลาส่งอีเมลรายงาน" เห็นเฉพาะคนที่มี `member.settings.manage` (action/service ตรวจซ้ำอีกชั้น)
export default async function MemberReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: ReportTab = isReportTab(sp.tab) ? sp.tab : "overview";
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!hasMemberPerm(actor, "member.report.view")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const now = new Date();
  const schedule = canManageSettings(actor) ? await getReportSchedule(ctx) : null;

  let body: React.ReactNode;
  if (tab === "overview") {
    const [ov, rf, tr, pt, pm] = await Promise.all([
      overview(ctx, actor, { months: 12, now }),
      rfm(ctx, actor, { days: 365, now }),
      tiers(ctx, actor, { now }),
      points(ctx, actor, { months: 6, now }),
      promotions(ctx, actor, { days: 90, now }),
    ]);
    body = (
      <>
        <ReportKpis data={ov} />
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <ReportNewMembersChart rows={ov.newPerMonth} />
          <ReportRfmGrid data={rf} />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ReportTiersCard data={tr} />
          <ReportPointsCard data={pt} />
          <ReportPromotionsCard systemId={id} data={pm} />
        </div>
      </>
    );
  } else if (tab === "rfm") {
    const rf = await rfm(ctx, actor, { days: 365, now });
    body = (
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ReportRfmGrid data={rf} detailed />
        <ReportRfmTable data={rf} />
      </div>
    );
  } else if (tab === "tiers") {
    body = <ReportTiersCard data={await tiers(ctx, actor, { now })} detailed />;
  } else if (tab === "points") {
    body = <ReportPointsCard data={await points(ctx, actor, { months: 6, now })} detailed />;
  } else if (tab === "promotions") {
    body = <ReportPromotionsCard systemId={id} data={await promotions(ctx, actor, { days: 90, now })} detailed />;
  } else if (tab === "sources") {
    body = <ReportSourcesTable data={await sources(ctx, actor, { days: 90, now })} />;
  } else {
    body = <ReportCohortTable data={await cohort(ctx, actor, { months: 6, now })} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="รายงานสมาชิก"
        back={{ href: `/app/sys/${id}`, label: "ระบบสมาชิก" }}
        actions={<ReportActions systemId={id} tab={tab} schedule={schedule} />}
      />
      <MemberTabs systemId={id} actor={actor} />
      <div data-testid="reports-page" className="flex min-w-0 flex-col gap-4">
        <ReportTabs systemId={id} tab={tab} />
        {body}
      </div>
    </div>
  );
}
