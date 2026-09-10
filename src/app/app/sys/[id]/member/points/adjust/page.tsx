import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { getPointSettings, listPointCustomers, resolvePointSystemIds } from "@/lib/modules/point";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { PointAdjustForm } from "@/components/member/PointAdjustForm";
import { EmptyState } from "@/components/ui/EmptyState";

// หน้า "แต้ม › ปรับแต้ม" (M2.2 · พิมพ์เขียว §5.5 §6.2 · สิทธิ์ member.point.adjust ผ่านเพดาน+สายอนุมัติ
// — ดูเหตุผลในหัว `src/lib/modules/point/adjust.ts`)
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()

export default async function PointsAdjustPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const [settings, pointSystemIds] = await Promise.all([getPointSettings(tenantId), resolvePointSystemIds(tenantId, id)]);
  const pointSystemId = pointSystemIds[0];
  const customers = pointSystemId ? await listPointCustomers(tenantId, pointSystemId) : [];

  return (
    <div data-testid="points-adjust" className="flex flex-col gap-5">
      <PageHeader
        title="ปรับแต้ม"
        back={{ href: `/app/sys/${id}/member/points`, label: "แต้ม" }}
        desc="แจก/หักแต้มให้สมาชิกด้วยมือ — ต้องระบุเหตุผลทุกครั้ง"
      />
      <MemberTabs systemId={id} actor={actor} />
      {pointSystemId ? (
        customers.length > 0 ? (
          <PointAdjustForm systemId={id} customers={customers} adjustApprovalOver={settings.adjustApprovalOver} />
        ) : (
          <EmptyState text="ยังไม่มีสมาชิกให้ปรับแต้ม — สมาชิกจะเห็นในนี้เมื่อสมัคร/ซื้อในกิจการที่เชื่อมกับระบบแต้มนี้" />
        )
      ) : (
        <EmptyState text="ยังไม่ได้เชื่อมระบบแต้มกับสาขาของระบบสมาชิกนี้ — ไปตั้งค่าที่ทะเบียนระบบก่อน" />
      )}
    </div>
  );
}
