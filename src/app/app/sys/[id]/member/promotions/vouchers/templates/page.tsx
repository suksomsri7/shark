import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { listTemplates } from "@/lib/modules/voucher/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { VoucherTemplatesBoard } from "@/components/member/VoucherTemplatesBoard";

// หน้า "โปรโมชัน › Voucher › แบบที่ตั้งไว้" (M2.5)
//
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()
// 🔴 ปุ่มเพิ่ม/เปิด-ปิดแบบ โผล่เฉพาะคนที่มีคีย์ `member.promo.manage` (คนอื่นดูรายการได้อย่างเดียว)

export default async function VoucherTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const templates = await listTemplates({ tenantId, systemId: id, actorUserId: auth.user.id });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="แบบ voucher"
        back={{ href: `/app/sys/${id}/member/promotions/vouchers`, label: "Voucher" }}
        desc="ตั้งเงื่อนไขไว้ครั้งเดียว แล้วออกซ้ำได้ทุกวัน — ใบที่ออกไปแล้วไม่เปลี่ยนตามการแก้แบบ"
      />
      <MemberTabs systemId={id} actor={actor} />
      <VoucherTemplatesBoard
        systemId={id}
        rows={templates.map((t) => ({
          id: t.id,
          name: t.name,
          kind: t.kind,
          value: t.value,
          validDays: t.validDays,
          origin: t.origin,
          active: t.active,
          issuedCount: t.issuedCount,
          minSatang: t.config.minSatang ?? null,
        }))}
        canManage={hasMemberPerm(actor, "member.promo.manage")}
      />
    </div>
  );
}
