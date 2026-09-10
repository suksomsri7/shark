import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { listCards } from "@/lib/modules/stamp/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { StampCardEditor } from "@/components/member/StampCardEditor";
import { StampCardsTable } from "@/components/member/StampCardsTable";

// หน้า "สร้างสแตมป์การ์ด" (M2.3 · ภาพ 17) — ฟอร์มเปล่าพร้อมค่าปริยาย 10 ช่อง · ประทับเอง · แต้ม
// 🔴 ต้องมีคีย์ `member.loyalty.manage` เท่านั้น (404-not-403 · §6.4)

export default async function NewStampCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor) || !hasMemberPerm(actor, "member.loyalty.manage")) notFound();

  const [tiers, units, services, rows] = await Promise.all([
    prisma.memberTierDef.findMany({
      where: { tenantId, systemId: id, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.bookingService.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 40, select: { id: true, name: true } }),
    listCards({ tenantId, systemId: id, actorUserId: auth.user.id }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="สร้างสแตมป์การ์ด" back={{ href: `/app/sys/${id}/member/stamps`, label: "สแตมป์" }} />
      <StampCardEditor
        systemId={id}
        card={null}
        sampleStamps={0}
        tiers={tiers}
        units={units}
        services={services}
        canManage
      />
      <StampCardsTable systemId={id} rows={rows} canManage />
    </div>
  );
}
