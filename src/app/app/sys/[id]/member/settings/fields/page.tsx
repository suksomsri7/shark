import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor, canManageSettings } from "@/lib/modules/member/access";
import { listLayout } from "@/lib/modules/member/fields";
import { TEMPLATES } from "@/lib/modules/member/templates";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { FieldDesigner, type TemplateOption } from "@/components/member/FieldDesigner";

// หน้า "ระบบสมาชิก › ตั้งค่า › ฟิลด์" (M1.3 · ภาพ ledger/design-member/03-field-designer.png)
//
// 🔴 ระบบต้องเป็น MEMBER ของร้านนี้จริง (ไม่ใช่ระบบอื่น/ร้านอื่น) → ไม่เจอ = notFound()
// 🔴 กติกา 404-not-403 (§6.4): ไม่มี member.settings.manage (คีย์ที่ผ่าน canManageSettings() ของ access.ts —
//    ดูหมายเหตุยาวว่าทำไมไม่ใช้ assertCan ตรง ๆ ที่หัวไฟล์ fields-actions.ts) → notFound() เหมือนกัน ไม่ใช่หน้า 403
export default async function MemberFieldsSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canManageSettings(actor)) notFound();

  const { sections } = await listLayout({ tenantId, systemId: id, actorUserId: auth.user.id }, { includeArchived: true });

  const templates: TemplateOption[] = Object.values(TEMPLATES).map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    sectionsCount: t.sections.length,
    fieldsCount: t.sections.reduce((n, s) => n + s.fields.length, 0),
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ตั้งค่าฟิลด์สมาชิก"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="ลากชนิดฟิลด์จากซ้ายมาวางในส่วนที่ต้องการ หรือกด + ที่หัวส่วน — ทุกการแก้ไขบันทึกทันที"
      />
      <MemberTabs systemId={id} actor={actor} />
      <FieldDesigner systemId={id} initialSections={sections} templates={templates} />
    </div>
  );
}
