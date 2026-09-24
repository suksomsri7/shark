import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { calendarSettings } from "@/lib/modules/crm/sequences";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { SequenceCalendarSettings } from "@/components/crm/sequences/SequenceCalendarSettings";

// วันทำการและวันหยุด (CRM v2 · ใบ C2.2 · R-E.9) — `/app/sys/{id}/crm/settings/holidays`
//   ขั้น "รอ" ของลำดับการติดตามนับวันทำการจากหน้านี้ (settings.crm.businessDays / settings.crm.holidays)
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 (requireCrmV2Page) · ไม่มีคีย์ `crm.sequence.manage` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร · การเขียนไปทาง server action ของโฟลเดอร์ sequences (คำสั่ง jsonb_set เดียวในบริการ)

export default async function CrmHolidaysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.sequence.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const cal = await calendarSettings(ctx, actor);
  const def = systemDef(sys.type);

  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4" data-testid="crm-holidays-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings/sequences`, label: "ลำดับการติดตาม" }}
        desc="วันทำการและวันหยุด — ขั้น “รอ” ของลำดับการติดตามจะข้ามวันที่ไม่ใช่วันทำการและวันหยุดของร้าน"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <SequenceCalendarSettings data={{ systemId: id, businessDays: cal.businessDays, holidays: cal.holidays, importYears: cal.importYears }} />
    </div>
  );
}
