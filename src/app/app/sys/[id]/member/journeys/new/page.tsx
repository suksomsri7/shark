import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { canManageJourneys, journeyBuilderOptions } from "@/lib/modules/member/journeys";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { JourneyBuilder } from "@/components/member/JourneyBuilder";

// หน้า "ระบบสมาชิก › Journey อัตโนมัติ › สร้างใหม่" (M3.3 · ภาพ 07 บน — ตัวสร้างว่าง + สำเร็จรูป 6 แบบ)
// `/app/sys/{id}/member/journeys/new`
//
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ · อ่านโมดูลสมาชิกไม่ได้ · หรือไม่มีสิทธิ์สร้าง journey
export default async function MemberJourneyNewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor) || !canManageJourneys(actor)) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const options = await journeyBuilderOptions(ctx, actor);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="สร้าง Journey ใหม่"
        back={{ href: `/app/sys/${id}/member/journeys`, label: "Journey อัตโนมัติ" }}
        desc="เลือกเหตุการณ์ที่เริ่ม journey ตั้งเงื่อนไข แล้วเลือกสิ่งที่ต้องทำ — หรือเริ่มจากสำเร็จรูป 6 แบบ"
      />
      <MemberTabs systemId={id} actor={actor} />
      <JourneyBuilder
        systemId={id}
        journeyId={null}
        initial={{ name: "", trigger: { event: "member.created" }, conditions: [], actions: [{ type: "SEND_LINE", params: { template: "ยินดีต้อนรับคุณ {ชื่อ} ค่ะ" } }], holdoutPct: 10, reentryDays: null, enabled: true }}
        fields={options.fields}
        templates={options.templates}
        boards={options.boards}
        canManage
        cancelHref={`/app/sys/${id}/member/journeys`}
      />
    </div>
  );
}
