import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { aiEnabled } from "@/lib/ai/service";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { assistantState } from "@/lib/modules/member/assistant";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberAssistant } from "@/components/member/MemberAssistant";

// หน้า "ระบบสมาชิก › ผู้ช่วย AI" (M3.10 · ภาพ ledger/design-member/27-ai-panel-api.png ครึ่งซ้าย)
// `/app/sys/{id}/member/assistant?conversation=<AiConversation.id>`
//
// คุยกับผู้ช่วยในแอปเรื่องสมาชิก → ผู้ช่วยค้น/สรุปได้ทันที (เครื่องมืออ่าน) ส่วนงานที่เปลี่ยนข้อมูลกลายเป็น
// กล่อง "ข้อเสนอ (ยังไม่ทำ)" ที่ต้องกดยืนยันด้วยสิทธิ์ของคนกดเอง (ai/proposals · K3.5)
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้ + เข้าโมดูลสมาชิกได้ → ไม่งั้น notFound() (404-not-403 §6.4)
// 🔴 บทสนทนาของร้านอื่น/ไม่มีจริงใน `?conversation=` = เปิดเป็นบทสนทนาว่าง (ไม่บอกว่ามีอยู่)
export default async function MemberAssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conversation?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true, name: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  // ชื่อสมาชิกในตารางผลค้นหา resolve ที่นี่ด้วยสิทธิ์ของคนเปิดหน้า (ไม่เข้า prompt ของ AI · ตีกลับรอบ 1)
  const state = await assistantState(tenantId, typeof sp.conversation === "string" ? sp.conversation : null, {
    systemId: id,
    actor,
    userId: auth.user.id,
  });

  return (
    <div className="flex min-w-0 max-w-4xl flex-col gap-5">
      <PageHeader
        title={`${sys.name} — ผู้ช่วย AI`}
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="ถามเรื่องสมาชิกเป็นภาษาคน ผู้ช่วยค้นให้ทันที ส่วนงานที่เปลี่ยนข้อมูลจะขึ้นเป็นข้อเสนอให้คุณกดยืนยันก่อนเสมอ"
      />
      <MemberTabs systemId={id} actor={actor} />
      <MemberAssistant systemId={id} initial={state} enabled={aiEnabled()} />
    </div>
  );
}
