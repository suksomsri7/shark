import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { expiringForMemberSystem } from "@/lib/modules/point";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { PointExpiringTable } from "@/components/member/PointExpiringTable";

// หน้า "แต้ม › ใกล้หมดอายุ" (M2.2 · พิมพ์เขียว §5.5 §11.4)
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()

const DAY_OPTIONS = new Set([7, 30, 90]);

export default async function PointsExpiringPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const rawDays = Array.isArray(rawQuery.days) ? rawQuery.days[0] : rawQuery.days;
  const days = DAY_OPTIONS.has(Number(rawDays)) ? Number(rawDays) : 30;

  const rows = await expiringForMemberSystem(tenantId, id, days);

  return (
    <div data-testid="points-expiring" className="flex flex-col gap-5">
      <PageHeader
        title="แต้มใกล้หมดอายุ"
        back={{ href: `/app/sys/${id}/member/points`, label: "แต้ม" }}
        desc="ล็อตแต้มที่จะหมดอายุเร็ว ๆ นี้ — เรียงใกล้หมดก่อน"
      />
      <MemberTabs systemId={id} actor={actor} />
      <PointExpiringTable rows={rows} days={days} />
    </div>
  );
}
