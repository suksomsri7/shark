import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { getCard, listCards, sampleStamps } from "@/lib/modules/stamp/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { StampCardEditor } from "@/components/member/StampCardEditor";
import { StampCardsTable } from "@/components/member/StampCardsTable";

// หน้า "ตั้งค่าสแตมป์การ์ด" (M2.3 · ภาพ ledger/design-member/17-stamp-card-editor.png)
//   ซ้าย = ฟอร์มตั้งค่าการ์ด · ขวา = ตัวอย่างการ์ดจริง + สถิติ 3 ตัว · ล่าง = ตารางใบทั้งหมด
// 🔴 ต้องมีคีย์ `member.loyalty.manage` เท่านั้น (404-not-403 · §6.4)

export default async function StampCardPage({ params }: { params: Promise<{ id: string; cardId: string }> }) {
  const { id, cardId } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor) || !hasMemberPerm(actor, "member.loyalty.manage")) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const card = await getCard(ctx, cardId).catch(() => null);
  if (!card) notFound();

  const [sample, tiers, units, services, rows] = await Promise.all([
    sampleStamps(ctx, card.id),
    prisma.memberTierDef.findMany({
      where: { tenantId, systemId: id, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.bookingService.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 40, select: { id: true, name: true } }),
    listCards(ctx),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={card.name} back={{ href: `/app/sys/${id}/member/stamps`, label: "สแตมป์" }} />
      <StampCardEditor
        systemId={id}
        card={card}
        sampleStamps={sample}
        tiers={tiers}
        units={units}
        services={services}
        canManage
      />
      <StampCardsTable systemId={id} rows={rows} canManage />
    </div>
  );
}
