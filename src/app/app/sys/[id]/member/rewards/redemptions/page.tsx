import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { listRedemptionsV2, resolveRewardCtx } from "@/lib/modules/reward";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { RewardRedemptionsTable } from "@/components/member/RewardRedemptionsTable";

// หน้า "ประวัติการแลก" (M2.4 · ภาพ 18 ล่าง) — รหัส/ของรางวัล/สมาชิก/สถานะ/สาขา/พนักงานที่ส่งมอบ
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()

export default async function RewardRedemptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const ctx = await resolveRewardCtx(tenantId, id, auth.user.id);
  const rows = ctx ? await listRedemptionsV2(ctx, { take: 100 }) : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ประวัติการแลก" back={{ href: `/app/sys/${id}/member/rewards`, label: "รางวัล" }} />
      <MemberTabs systemId={id} actor={actor} />
      <RewardRedemptionsTable rows={rows} />
    </div>
  );
}
