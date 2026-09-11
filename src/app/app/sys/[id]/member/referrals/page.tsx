import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { publicOrigin } from "@/lib/core/origin";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { getProgram, leaderboard, listReferrals, stats } from "@/lib/modules/member/referrals";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { ReferralEnabledSwitch, ReferralSettings } from "@/components/member/ReferralSettings";
import { ReferralKpis, ReferralLeaderboard } from "@/components/member/ReferralDashboard";
import { ReferralRecentTable } from "@/components/member/ReferralRecentTable";

// หน้า "ระบบสมาชิก › แนะนำเพื่อน" (M3.5 · ภาพ ledger/design-member/24-referral.png)
// `/app/sys/{id}/member/referrals` — ซ้าย ตั้งค่า (รางวัล · กันโกง · ข้อความแชร์ LINE) · ขวา KPI 4 · ผู้แนะนำสูงสุด · การแนะนำล่าสุด
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + อ่านโมดูลสมาชิกได้ → ไม่งั้น notFound() (404-not-403 §6.4)
// 🔴 แก้ค่า/สวิตช์/ปฏิเสธ เห็นเฉพาะคนที่มี `member.referral.manage` — พนักงานที่อ่านได้เห็นค่าอย่างเดียว
// 🔴 ตัวเลขทุกช่องกรองขอบเขตสาขาตามสาขาหลักของ "ผู้แนะนำ" (§6.1) ใน service แล้ว
const WINDOW_DAYS = 30;

export default async function MemberReferralsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = hasMemberPerm(actor, "member.referral.manage");
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const [program, kpi, leaders, recent, origin] = await Promise.all([
    getProgram(ctx),
    stats(ctx, actor, { days: WINDOW_DAYS }),
    leaderboard(ctx, actor, { days: WINDOW_DAYS, take: 5 }),
    listReferrals(ctx, actor, { take: 20 }),
    publicOrigin(),
  ]);
  const host = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const windowLabel = `${WINDOW_DAYS} วันล่าสุด`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="แนะนำเพื่อน"
        back={{ href: `/app/sys/${id}/member/campaigns`, label: "แคมเปญ" }}
        desc="รางวัลสองฝั่ง ผู้แนะนำ+เพื่อน · ให้เมื่อเพื่อนถึงเงื่อนไข · กันโกงด้วยเบอร์/อุปกรณ์ซ้ำ"
        actions={<ReferralEnabledSwitch systemId={id} enabled={program.enabled} canManage={canManage} />}
      />
      <MemberTabs systemId={id} actor={actor} />

      <div data-testid="referrals-page" className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <ReferralSettings systemId={id} program={program} canManage={canManage} linkPattern={`${host}/ref/{โค้ด}`} />
        <div className="flex min-w-0 flex-col gap-4">
          <ReferralKpis stats={kpi} windowLabel={windowLabel} />
          <ReferralLeaderboard rows={leaders} windowLabel={windowLabel} />
          <ReferralRecentTable systemId={id} rows={recent.items} canManage={canManage} />
        </div>
      </div>
    </div>
  );
}
