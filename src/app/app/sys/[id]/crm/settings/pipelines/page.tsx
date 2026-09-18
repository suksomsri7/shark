import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { evaluate } from "@/lib/core/rbac";
import type { Role } from "@prisma/client";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { listPipelines } from "@/lib/modules/crm/pipelines";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { PipelineSettings } from "./_components/PipelineSettings";

// ตั้งค่า pipeline (CRM v2 · ใบ C1.5 · §2.2 /settings/pipelines · R-A) — `/app/sys/{id}/crm/settings/pipelines`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ หรือไม่มีสิทธิ์ `crm.settings.manage` = notFound() · หน้า GET ไม่เขียนอะไร
export default async function PipelineSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const m = { role: auth.active.role as Role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> };
  if (!evaluate(m, { module: "crm", action: "crm.settings.manage" })) notFound();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const pipelines = await listPipelines(ctx, actor, { includeArchived: true });
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4" data-testid="settings-pipelines-page">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} back={{ href: `/app/sys/${id}/crm/pipelines`, label: "pipeline ทั้งหมด" }} desc="ตั้งค่า pipeline — สร้าง แก้ชื่อ ตั้งค่าเริ่มต้น และเก็บถาวร" />
      <ModuleTabs items={crmNavItems(id)} />
      <PipelineSettings systemId={id} pipelines={pipelines} />
    </div>
  );
}
