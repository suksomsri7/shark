import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { getSettings } from "@/lib/modules/giftcard/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { GiftCardSettingsForm } from "@/components/member/GiftCardSettingsForm";

// หน้า "โปรโมชัน › Gift Card › ตั้งค่า" (M2.6 · ภาพ 20 ครึ่งขวา)
//
// 🔴 ต้องมีคีย์ `member.giftcard.manage` เจาะจง — **MANAGER ไม่ได้โดยปริยาย** (§6.1 · 1 ใน 4 คีย์ยกเว้น)
//    ไม่มีสิทธิ์ = notFound() ตามกติกา 404-not-403 (§6.4)

export default async function GiftCardSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!hasMemberPerm(actor, "member.giftcard.manage")) notFound();

  const settings = await getSettings({ tenantId, systemId: id, actorUserId: auth.user.id });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ตั้งค่า Gift Card"
        back={{ href: `/app/sys/${id}/member/promotions/giftcards`, label: "Gift Card" }}
        desc="เปิด/ปิดการขายบัตรกำนัล มูลค่าที่ให้เลือก อายุบัตร และการพ่วงกับโมดูลบัญชี"
      />
      <MemberTabs systemId={id} actor={actor} />
      <GiftCardSettingsForm systemId={id} settings={settings} />
    </div>
  );
}
