import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { resolveRewardCtx } from "@/lib/modules/reward";
import { listCards } from "@/lib/modules/stamp";
import { PageHeader } from "@/components/ui/PageHeader";
import { RewardEditor } from "@/components/member/RewardEditor";

// หน้า "เพิ่มของรางวัล" (M2.4 · ภาพ 18 ซ้าย) — ฟอร์มเปล่า
// 🔴 ต้องมีคีย์ `member.loyalty.manage` เท่านั้น (404-not-403 · §6.4)

export default async function NewRewardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor) || !hasMemberPerm(actor, "member.loyalty.manage")) notFound();

  const ctx = await resolveRewardCtx(tenantId, id, auth.user.id);
  if (!ctx) notFound();

  const [tiers, units, stampCards] = await Promise.all([
    prisma.memberTierDef.findMany({
      where: { tenantId, systemId: id, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    listCards({ tenantId, systemId: id, actorUserId: auth.user.id }).then((rows) => rows.map((c) => ({ id: c.id, name: c.name }))),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="เพิ่มของรางวัล" back={{ href: `/app/sys/${id}/member/rewards`, label: "รางวัล" }} />
      <RewardEditor systemId={id} reward={null} tiers={tiers} units={units} stampCards={stampCards} canManage />
    </div>
  );
}
