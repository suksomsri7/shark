import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { getPortalSettings } from "@/lib/modules/crm/portal";
import { portalPath } from "@/lib/modules/crm/portal-shared";
import { savePortalSettingsAction } from "@/lib/modules/crm/portal-actions";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { PortalSettingsForm } from "@/components/crm/portal/PortalSettingsForm";

// ตั้งค่าพอร์ทัลลูกค้าองค์กร (ใบ C3.5 · พิมพ์เขียว §3.13 · `settings.crm.portal`) — `/app/sys/{id}/crm/settings/portal`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.portal.manage` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร · บันทึกผ่าน action (jsonb_set คำสั่งเดียว + audit `crm.portal.settings`)
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ ค่าที่ต้องแสดงถูกแปลงเป็น props ที่นี่ · action ส่งทาง props
export default async function CrmPortalSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.portal.manage")) notFound();
  const s = await getPortalSettings({ tenantId, systemId: id, actorUserId: auth.user.id }, actor);
  const def = systemDef(sys.type);
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}`, label: "หน้าแรก CRM" }}
        desc="พอร์ทัลลูกค้าองค์กร — ลูกค้าบริษัทเข้ามาดู/ตอบรับใบเสนอราคา ชำระใบแจ้งหนี้ ดูเอกสาร และแจ้งเรื่องได้เอง (เชิญรายคนจากหน้าบริษัท 360)"
      />
      <ModuleTabs items={crmNavItems(id, (k) => crmCan(actor, k))} />
      <PortalSettingsForm
        systemId={id}
        portalUrl={`${appUrl}${portalPath(s.slug, "login")}`}
        initial={{ enabled: s.enabled, loginMethods: s.loginMethods, showDeals: s.showDeals, allowIssue: s.allowIssue, issueBoardId: s.issueBoardId }}
        boards={s.boards}
        save={savePortalSettingsAction}
      />
    </div>
  );
}
