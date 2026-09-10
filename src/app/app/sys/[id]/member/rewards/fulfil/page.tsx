import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { resolveRewardCtx } from "@/lib/modules/reward";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { RewardFulfilPanel } from "@/components/member/RewardFulfilPanel";

// หน้า "รับของ" (M2.4 · ภาพ 18 ขวา) — แผงสแกน QR / พิมพ์รหัส แล้วส่งมอบ/ยกเลิก
// 🔴 ต้องมีคีย์ `member.loyalty.fulfil` เท่านั้น (404-not-403 · §6.4)

export default async function RewardFulfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor) || !hasMemberPerm(actor, "member.loyalty.fulfil")) notFound();

  const ctx = await resolveRewardCtx(tenantId, id, auth.user.id);
  if (!ctx) notFound();

  const units = await prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="รับของ" back={{ href: `/app/sys/${id}/member/rewards`, label: "รางวัล" }} />
      <MemberTabs systemId={id} actor={actor} />
      <RewardFulfilPanel systemId={id} units={units} />
    </div>
  );
}
