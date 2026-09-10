import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor, canReadMember, hasMemberPerm } from "@/lib/modules/member/access";
import { findDuplicates } from "@/lib/modules/member/profile";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MembersDuplicates } from "@/components/member/MembersDuplicates";

// หน้าตัวซ้ำ/เปรียบเทียบ/รวมคน (M1.6 · ภาพ 11) — `/app/sys/{id}/member/members/duplicates`
// 🔴 404-not-403 (§6.4): ไม่ใช่ระบบ MEMBER ของร้านนี้ หรือไม่มีสิทธิ์ `member.customer.merge` → notFound()
export default async function MembersDuplicatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  if (!hasMemberPerm(actor, "member.customer.merge")) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const pairs = await findDuplicates(ctx, actor, { status: "OPEN" });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`ตัวซ้ำที่อาจเป็นคนเดียวกัน (${pairs.length}) — ${sys.name}`} back={{ href: `/app/sys/${id}/member/members`, label: "สมาชิก" }} />
      <MemberTabs systemId={id} actor={actor} />
      <MembersDuplicates systemId={id} pairs={pairs} canMerge={actor.role === "OWNER" || actor.role === "MANAGER"} actorRole={actor.role} />
    </div>
  );
}
