import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { listTierDefs } from "@/lib/modules/member/tiers";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { TierBenefitsEditor } from "@/components/member/TierBenefitsEditor";

// หน้า "แก้ระดับสมาชิก" (M1.10 · ภาพ ledger/design-member/15-tier-benefits-editor.png)
// `/app/sys/{id}/member/tiers/{tierId}` — โฟลเดอร์ใช้ `[tierId]` (ไม่ใช่ `[id]`) เพราะ Next.js ห้าม dynamic
// segment ชื่อซ้ำในเส้นทางเดียว (`/app/sys/[id]/...`) — บทเรียนเดียวกับ `members/[memberId]` ของ M1.5
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + อ่านโมดูลสมาชิกได้ → ไม่งั้น notFound() (404-not-403 §6.4)
//    STAFF ที่อ่านได้แต่ไม่มี `member.tier.manage` ยังเปิดหน้านี้ได้ (อ่านอย่างเดียว — ไม่มีปุ่มบันทึก)
export default async function TierDetailPage({ params }: { params: Promise<{ id: string; tierId: string }> }) {
  const { id, tierId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const allTiers = await listTierDefs(ctx, { includeArchived: true });
  const tier = allTiers.find((t) => t.id === tierId);
  if (!tier) notFound();

  const activeTiers = allTiers.filter((t) => !t.archivedAt);
  const canManage = hasMemberPerm(actor, "member.tier.manage");
  const plans = await prisma.memberPlan.findMany({ where: { tenantId, systemId: id, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`แก้ระดับสมาชิก — ${tier.name}`} back={{ href: `/app/sys/${id}/member/tiers`, label: "ระดับสมาชิก" }} />
      <MemberTabs systemId={id} actor={actor} />
      <TierBenefitsEditor systemId={id} shopName={sys.name} tier={tier} allTiers={activeTiers.length ? activeTiers : allTiers} plans={plans} canManage={canManage} />
    </div>
  );
}
