import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { listRedemptionsV2, listRewardsV2, resolveRewardCtx } from "@/lib/modules/reward";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberIcon } from "@/components/member/MemberIcon";
import { RewardsCatalog } from "@/components/member/RewardsCatalog";

// หน้า "รางวัล" (M2.4 · ภาพ ledger/design-member/05-loyalty.png ล่าง) — แคตตาล็อก + ตาราง "รอรับ"
//
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()
// 🔴 ปุ่ม "เพิ่มของรางวัล" โผล่เฉพาะคนที่มีคีย์ `member.loyalty.manage`
// 🔴 ตัวเลขทุกก้อนมาจาก `reward` facade — หน้าไม่คิดเลขเอง

export default async function RewardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = hasMemberPerm(actor, "member.loyalty.manage");

  const ctx = await resolveRewardCtx(tenantId, id, auth.user.id);
  const [rewards, pending, tiers] = ctx
    ? await Promise.all([
        listRewardsV2(ctx),
        listRedemptionsV2(ctx, { status: "PENDING", take: 50 }),
        prisma.memberTierDef.findMany({
          where: { tenantId, systemId: id, archivedAt: null },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], [], []];

  const tierNameOf = (ids: string[]) => tiers.filter((t) => ids.includes(t.id)).map((t) => t.name).join("/") || "บางระดับ";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="รางวัล"
        desc="ของรางวัลที่แลกได้ด้วยแต้ม/สแตมป์ — ตั้งราคา จำกัดระดับ/สาขา แล้วให้พนักงานส่งมอบหน้าร้าน"
        actions={
          canManage ? (
            <>
              <Link href={`/app/sys/${id}/member/rewards/fulfil`} className="btn inline-flex items-center gap-1.5">
                <MemberIcon name="cam" size="sm" />
                รับของ
              </Link>
              <Link href={`/app/sys/${id}/member/rewards/redemptions`} className="btn inline-flex items-center gap-1.5">
                <MemberIcon name="doc" size="sm" />
                ประวัติการแลก
              </Link>
              <Link
                href={`/app/sys/${id}/member/rewards/new`}
                data-testid="rewards-add"
                className="btn btn-primary inline-flex items-center gap-1.5"
              >
                <MemberIcon name="plus" size="sm" />
                เพิ่มของรางวัล
              </Link>
            </>
          ) : undefined
        }
      />
      <MemberTabs systemId={id} actor={actor} />
      {ctx ? (
        <RewardsCatalog systemId={id} rewards={rewards} pending={pending} canManage={canManage} tierNameOf={tierNameOf} />
      ) : (
        <div data-testid="rewards-page" className="card p-6 text-sm" style={{ color: "var(--color-muted)" }}>
          ยังไม่ได้ตั้งค่าระบบรางวัลสำหรับร้านนี้ — ติดต่อผู้ดูแลระบบให้เพิ่มระบบรางวัลก่อน
        </div>
      )}
    </div>
  );
}
