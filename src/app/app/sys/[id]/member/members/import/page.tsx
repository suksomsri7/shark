import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor, canReadMember, hasMemberPerm } from "@/lib/modules/member/access";
import { listLayout } from "@/lib/modules/member/fields";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MembersImportWizard } from "@/components/member/MembersImportWizard";

// หน้านำเข้าสมาชิกจาก CSV (M1.6 · ภาพ 12) — `/app/sys/{id}/member/members/import`
// 🔴 404-not-403 (§6.4): ไม่ใช่ระบบ MEMBER ของร้านนี้ หรือไม่มีสิทธิ์ `member.customer.import` → notFound()
export default async function MembersImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();
  if (!hasMemberPerm(actor, "member.customer.import")) notFound();

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [layout, units] = await Promise.all([
    listLayout(ctx),
    prisma.businessUnit.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const fieldOptions = layout.sections.flatMap((s) => s.fields).map((f) => ({
    id: f.id,
    key: f.key,
    label: f.label,
    type: f.type,
    isSystem: f.isSystem,
    choices: f.options.choices?.map((c) => ({ value: c.value, label: c.label })),
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`นำเข้าสมาชิกจาก CSV — ${sys.name}`} back={{ href: `/app/sys/${id}/member/members`, label: "สมาชิก" }} />
      <MemberTabs systemId={id} actor={actor} />
      <MembersImportWizard systemId={id} fieldOptions={fieldOptions} units={units} />
    </div>
  );
}
