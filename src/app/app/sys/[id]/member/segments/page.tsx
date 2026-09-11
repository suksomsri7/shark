import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { canManageSegments, listSegments } from "@/lib/modules/member/segments";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { SegmentsList, type SegmentRowView } from "@/components/member/SegmentsList";

// หน้า "ระบบสมาชิก › กลุ่มลูกค้า" (M3.1 · ภาพ ledger/design-member/21-campaign-segment.png ขั้น 1)
// `/app/sys/{id}/member/segments` — รายการกลุ่มที่บันทึกไว้ + ทางเข้าตัวสร้างเงื่อนไข
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง + อ่านโมดูลสมาชิกได้ (read-โดยนัย) → ไม่งั้น notFound() (404-not-403 §6.4)
// 🔴 "บันทึก/ลบ" ต้องมีคีย์ `member.promo.manage` — คนที่ไม่มีเห็นรายการได้แต่ไม่มีปุ่ม (ด่านจริงอยู่ที่ service)
export default async function MemberSegmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  const canManage = canManageSegments(actor);

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const segments = await listSegments(ctx, actor);
  const dateFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" });

  const rows: SegmentRowView[] = segments.map((s) => ({
    id: s.id,
    name: s.name,
    summary: s.summary,
    lastCount: s.lastCount,
    lastCountAtLabel: s.lastCountAt ? dateFmt.format(s.lastCountAt) : null,
    scope: s.scope,
    ownerName: s.ownerName,
    canDelete: canManage || s.ownerUserId === actor.userId,
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="กลุ่มลูกค้า"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="ตั้งเงื่อนไขเป็นประโยคไทยจากทุกฟิลด์ของสมาชิก แล้วเอากลุ่มนี้ไปใช้ต่อกับแคมเปญ voucher และกฎอัตโนมัติ"
        actions={
          canManage ? (
            <Link data-testid="segments-add" href={`/app/sys/${id}/member/segments/new`} className="btn btn-primary text-sm">
              สร้างกลุ่มลูกค้า
            </Link>
          ) : null
        }
      />
      <MemberTabs systemId={id} actor={actor} />

      <div data-testid="segments-page" className="flex flex-col gap-4">
        <SegmentsList systemId={id} rows={rows} />
      </div>
    </div>
  );
}
