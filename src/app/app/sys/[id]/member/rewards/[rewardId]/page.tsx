import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { listRedemptionsV2, listRewardsV2, resolveRewardCtx } from "@/lib/modules/reward";
import { listCards } from "@/lib/modules/stamp";
import { PageHeader } from "@/components/ui/PageHeader";
import { RewardEditor } from "@/components/member/RewardEditor";
import { RewardRedemptionsTable } from "@/components/member/RewardRedemptionsTable";

// หน้า "แก้ไขของรางวัล" (M2.4 · ภาพ 18) — ฟอร์ม + ประวัติการแลกล่าสุดของระบบสมาชิกนี้
// 🔴 ต้องมีคีย์ `member.loyalty.manage` เท่านั้น (404-not-403 · §6.4)

export default async function RewardEditPage({ params }: { params: Promise<{ id: string; rewardId: string }> }) {
  const { id, rewardId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor) || !hasMemberPerm(actor, "member.loyalty.manage")) notFound();

  const ctx = await resolveRewardCtx(tenantId, id, auth.user.id);
  if (!ctx) notFound();

  const rewards = await listRewardsV2(ctx);
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) notFound();

  const [tiers, units, stampCards, history] = await Promise.all([
    prisma.memberTierDef.findMany({
      where: { tenantId, systemId: id, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    listCards({ tenantId, systemId: id, actorUserId: auth.user.id }).then((rows) => rows.map((c) => ({ id: c.id, name: c.name }))),
    listRedemptionsV2(ctx, { take: 6 }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={reward.name} back={{ href: `/app/sys/${id}/member/rewards`, label: "รางวัล" }} />
      <RewardEditor systemId={id} reward={reward} tiers={tiers} units={units} stampCards={stampCards} canManage />
      <RewardRedemptionsTable rows={history} />
    </div>
  );
}
