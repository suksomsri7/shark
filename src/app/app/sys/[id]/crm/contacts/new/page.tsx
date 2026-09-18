import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { customFieldLayout, ownerOptions } from "@/lib/modules/crm/contacts";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { NewContactForm } from "../_components/NewContactForm";

// เพิ่มผู้ติดต่อ (CRM v2 · ใบ C1.4 · §3.17) — `/app/sys/{id}/crm/contacts/new`
// 🔴 404-not-403: ระบบที่ไม่ใช่ CRM ของร้านนี้ = notFound() · หน้า GET ไม่เขียนอะไร (ฟิลด์ระบบ seed ตอนบันทึกครั้งแรก)
export default async function NewContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [owners, customFields] = await Promise.all([ownerOptions(ctx, actor), customFieldLayout(ctx, actor).catch(() => [])]);
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4" data-testid="contact-new-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/contacts`, label: "รายชื่อผู้ติดต่อ" }}
        desc="เพิ่มผู้ติดต่อ — ระบบตรวจเบอร์/อีเมลซ้ำในระบบนี้ให้ก่อนบันทึก"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <NewContactForm systemId={id} owners={owners} defaultOwner={auth.user.id} customFields={customFields} />
    </div>
  );
}
