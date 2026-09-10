import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor, canReadMember, hasMemberPerm } from "@/lib/modules/member/access";
import { listLayout } from "@/lib/modules/member/fields";
import { joinLinkFor } from "@/lib/modules/member/import";
import { listTierDefs } from "@/lib/modules/member/tiers";
import { currentPolicy } from "@/lib/modules/member/privacy";
import { listLinks } from "@/lib/modules/member/sources";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberRegisterForm } from "@/components/member/MemberRegisterForm";

// หน้าสมัครสมาชิกใหม่ (M1.6 · ภาพ 10) — `/app/sys/{id}/member/members/new`
// 🔴 404-not-403 (§6.4): ไม่ใช่ระบบ MEMBER ของร้านนี้ หรือไม่มีสิทธิ์ `member.customer.create` → notFound()
export default async function MemberNewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  if (!hasMemberPerm(actor, "member.customer.create")) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [layout, units, joinLink, tierDefs, policy, links, memberships] = await Promise.all([
    listLayout(ctx),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    // ลิงก์/QR ให้ลูกค้ากรอกเอง (ปุ่ม "QR LIFF" มุมบนของฟอร์ม) — สร้างไว้ล่วงหน้าตั้งแต่เปิดหน้า ไม่ต้องรอกดปุ่ม
    joinLinkFor(ctx, {}),
    // ระดับเริ่มต้น (แถบล่างของฟอร์ม) — ตัวที่ isDefault ไว้ ไม่มี = ตัวที่ sortOrder ต่ำสุด
    listTierDefs(ctx),
    // เวอร์ชันนโยบายความเป็นส่วนตัวที่บังคับใช้อยู่ (M1.7) — ไม่มี = ร้านยังไม่ได้ตั้งนโยบาย
    currentPolicy(ctx),
    // ลิงก์ที่มา/แคมเปญของระบบนี้ (M1.8) — ไม่มีลิงก์เลย = ร้านยังไม่ได้สร้าง
    listLinks(ctx),
    // สมาชิกทีมของร้าน (พนักงานที่รับ) — เรียงตามวันที่เข้าร่วม
    prisma.membership.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { userId: true, user: { select: { name: true, email: true } } } }),
  ]);

  const defaultTier = tierDefs.find((t) => t.isDefault) ?? [...tierDefs].sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
  const teamMembers = memberships.map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`สมัครสมาชิกใหม่ — ${sys.name}`} back={{ href: `/app/sys/${id}/member/members`, label: "สมาชิก" }} />
      <MemberTabs systemId={id} actor={actor} />
      <MemberRegisterForm
        systemId={id}
        sections={layout.sections}
        units={units}
        initialJoinLink={joinLink}
        campaigns={links.map((l) => ({ id: l.id, name: l.name }))}
        teamMembers={teamMembers}
        currentUserId={auth.user.id}
        defaultTierName={defaultTier?.name ?? null}
        privacyVersion={policy?.version ?? null}
      />
    </div>
  );
}
