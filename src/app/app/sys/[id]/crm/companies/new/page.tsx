import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { customFieldLayout, ownerOptions } from "@/lib/modules/crm/companies";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { NewCompanyForm } from "../_components/NewCompanyForm";

// เพิ่มบริษัท (CRM v2 · ใบ C1.3 · §3.17) — `/app/sys/{id}/crm/companies/new`
// 🔴 404-not-403: ระบบที่ไม่ใช่ CRM ของร้านนี้ = notFound()
export default async function NewCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  // 🔴 หน้า GET ไม่เขียนอะไร (รีวิว SF12) — ยังไม่ seed ฟิลด์ระบบก็แสดงฟอร์มได้ (ฟิลด์กำหนดเองอ่านอย่างเดียว)
  const [owners, customFields] = await Promise.all([ownerOptions(ctx, actor), customFieldLayout(ctx, actor).catch(() => [])]);
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4" data-testid="company-new-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/companies`, label: "รายชื่อบริษัท" }}
        desc="เพิ่มบริษัท — มีเลขภาษีแล้วระบบกันบริษัทซ้ำให้ · ไม่มีเลขภาษี ระบบจะบอกรายที่ชื่อคล้ายให้ตรวจ"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <NewCompanyForm systemId={id} owners={owners} defaultOwner={auth.user.id} customFields={customFields} />
    </div>
  );
}
