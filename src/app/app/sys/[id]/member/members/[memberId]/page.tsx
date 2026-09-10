import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor, canReadMember } from "@/lib/modules/member/access";
import { getMember360, MemberNotFoundError } from "@/lib/modules/member";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { Member360View } from "@/components/member/Member360";

// สมาชิก 360° (M1.5 · ภาพ 02) — `/app/sys/{id}/member/members/{memberId}`
// URL state: `?tab=profile|wallet|history|reviews|referrals`
//
// 🔴 โฟลเดอร์ใช้ `[memberId]` ไม่ใช่ `[id]` ซ้ำกับพารามิเตอร์ของระบบ (`[id]` ชั้นนอก) — Next.js ห้าม
//    ใช้ชื่อ dynamic segment ซ้ำกันในเส้นทางเดียว (`validate-app-paths.js`: "You cannot have the same
//    slug name … repeat within a single dynamic path") ไม่งั้น `next build`/`next dev` พังทั้งแอป
//    ดู ledger/wo-notes/member-M1.5.md หัวข้อ "ข้อแย้ง" (S3.3 อ้างพาธ `[id]/[id]` ตรง ๆ)
// 🔴 getMember360 throw MemberNotFoundError เมื่อคนนี้ไม่มี/มองไม่เห็น (unit scope) → notFound() เสมอ (§6.4)
export default async function Member360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; memberId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, memberId }, rawQuery] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const member = await getMember360(ctx, actor, memberId).catch((e: unknown) => {
    if (e instanceof MemberNotFoundError) return null;
    throw e;
  });
  if (!member) notFound();

  const tabRaw = rawQuery.tab;
  const tab = typeof tabRaw === "string" ? tabRaw : "profile";
  const basePath = `/app/sys/${id}/member/members/${memberId}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={member.profile.name || member.profile.memberCode} back={{ href: `/app/sys/${id}/member/members`, label: "สมาชิก" }} />
      <MemberTabs systemId={id} actor={actor} />
      <Member360View systemId={id} member={member} tab={tab} basePath={basePath} />
    </div>
  );
}
