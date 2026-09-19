import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
// CRM C1.7 ▸ ด่านคีย์ของ CRM (MANAGER ปริยายไม่มี crm.settings.manage — §6.1) ◂
import { crmCan } from "@/lib/modules/crm/access";
import type { Role } from "@prisma/client";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { listLostReasons } from "@/lib/modules/crm/lost-reasons";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { LostReasonSettings } from "./_components/LostReasonSettings";

// เหตุผลที่แพ้ (CRM v2 · ใบ C1.5 · §2.2 /settings/lost-reasons) — `/app/sys/{id}/crm/settings/lost-reasons`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ หรือไม่มีสิทธิ์ `crm.settings.manage` = notFound() · หน้า GET ไม่เขียนอะไร
export default async function LostReasonsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const m = { role: auth.active.role as Role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> };
  if (!crmCan(m, "crm.settings.manage")) notFound();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const reasons = await listLostReasons(ctx, actor);
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4" data-testid="settings-lost-reasons-page">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} back={{ href: `/app/sys/${id}/crm/settings/pipelines`, label: "ตั้งค่า pipeline" }} desc="เหตุผลที่แพ้ — ใช้ตอนปิดดีลเป็นแพ้ และในรายงานเหตุผลที่แพ้" />
      <ModuleTabs items={crmNavItems(id)} />
      <LostReasonSettings systemId={id} reasons={reasons.map((r) => ({ id: r.id, label: r.label, active: r.active, usedBy: r.usedBy }))} />
    </div>
  );
}
