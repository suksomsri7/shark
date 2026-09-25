import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { listFormTargets } from "@/lib/modules/crm/tracking";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { FormTargetsTable } from "@/components/crm/tracking/FormTargetsTable";
import type { CrmFormsPageData } from "@/components/crm/tracking/types";

// ตั้งค่า — ฟอร์มรับลูกค้า → CRM (ใบ C2.6 · RESOLUTIONS R-A) — `/app/sys/{id}/crm/settings/forms`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.tracking.manage` = notFound()
// 🔴 ตัวสร้างฟอร์ม (ช่องกรอก) ยังอยู่ที่ `/app/forms` — หน้านี้ตั้งเฉพาะ "ฝั่ง CRM" ของฟอร์ม
// 🔴 หน้า GET ไม่เขียนอะไร

export const dynamic = "force-dynamic";

export default async function CrmFormsSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.tracking.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const [forms, systems, rules] = await Promise.all([
    listFormTargets(ctx, actor),
    prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, orderBy: [{ createdAt: "asc" }], select: { id: true, name: true } }),
    prisma.crmAssignmentRule.findMany({ where: { tenantId, systemId: id }, orderBy: [{ sortOrder: "asc" }], select: { id: true, name: true } }),
  ]);

  const data: CrmFormsPageData = {
    systemId: id,
    forms,
    crmSystems: systems.map((s) => ({ value: s.id, label: s.name })),
    rules: rules.map((r) => ({ value: r.id, label: r.name })),
  };

  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="ตั้งค่า — ฟอร์มรับลูกค้า: ระบบ CRM ปลายทาง · กฎมอบหมาย · คะแนนเมื่อกรอก · บริษัทจากช่อง · กันสแปม · โค้ดฝัง"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <FormTargetsTable data={data} />
    </div>
  );
}
