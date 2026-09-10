import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, hasMemberPerm, toMemberActor } from "@/lib/modules/member/access";
import { listCards } from "@/lib/modules/stamp/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberIcon } from "@/components/member/MemberIcon";
import { StampCardsTable } from "@/components/member/StampCardsTable";

// หน้า "สแตมป์" (M2.3 · ภาพ ledger/design-member/17-stamp-card-editor.png ครึ่งล่าง)
//
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ / อ่านโมดูลสมาชิกไม่ได้ → notFound()
// 🔴 ปุ่ม "สร้างสแตมป์การ์ด" โผล่เฉพาะคนที่มีคีย์ `member.loyalty.manage` —
//    พนักงานที่ได้แค่สิทธิ์ประทับยังต้องเปิดดูได้ว่าร้านมีใบอะไรบ้าง (read-โดยนัย)
// 🔴 ตัวเลขทุกก้อนมาจาก `stamp/service.listCards()` — หน้าไม่คิดเลขเอง

export default async function StampsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = hasMemberPerm(actor, "member.loyalty.manage");

  const rows = await listCards({ tenantId, systemId: id, actorUserId: auth.user.id });

  return (
    <div data-testid="stamps-page" className="flex flex-col gap-5">
      <PageHeader
        title="สแตมป์"
        desc="บัตรสะสมตราของร้าน — ตั้งได้ว่าลูกค้าได้ตราเมื่อไหร่ และครบใบแล้วได้อะไร"
        actions={
          canManage ? (
            <Link
              href={`/app/sys/${id}/member/stamps/new`}
              data-testid="stamps-add"
              className="btn btn-primary inline-flex items-center gap-1.5"
            >
              <MemberIcon name="plus" size="sm" />
              สร้างสแตมป์การ์ด
            </Link>
          ) : undefined
        }
      />
      <MemberTabs systemId={id} actor={actor} />
      <StampCardsTable systemId={id} rows={rows} canManage={canManage} />
    </div>
  );
}
