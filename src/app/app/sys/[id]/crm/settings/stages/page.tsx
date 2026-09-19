import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
// CRM C1.7 ▸ ด่านคีย์ของ CRM (MANAGER ปริยายไม่มี crm.settings.manage — §6.1) ◂
import { crmCan } from "@/lib/modules/crm/access";
import type { Role } from "@prisma/client";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { dealFieldLayout } from "@/lib/modules/crm/deals";
import { listPipelines } from "@/lib/modules/crm/pipelines";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { StageSettings } from "./_components/StageSettings";

// ตั้งค่าขั้นของดีล (CRM v2 · ใบ C1.5 · §2.2 /settings/stages) — `/app/sys/{id}/crm/settings/stages?pipeline=`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ หรือไม่มีสิทธิ์ `crm.settings.manage` = notFound() · หน้า GET ไม่เขียนอะไร
export default async function StageSettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
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
  const [pipelines, layout] = await Promise.all([listPipelines(ctx, actor), dealFieldLayout(ctx, actor)]);
  const want = typeof sp.pipeline === "string" ? sp.pipeline : "";
  const pipe = pipelines.find((p) => p.id === want) ?? pipelines[0];
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-4xl flex-col gap-4" data-testid="settings-stages-page">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} back={{ href: `/app/sys/${id}/crm/settings/pipelines`, label: "ตั้งค่า pipeline" }} desc="ขั้นของดีล — โอกาสปิด วันนิ่ง และเงื่อนไขก่อนเข้าขั้น" />
      <ModuleTabs items={crmNavItems(id)} />
      {!pipe ? (
        <p className="card p-4 text-sm" data-testid="settings-stages-empty">
          ยังไม่มี pipeline —{" "}
          <Link href={`/app/sys/${id}/crm/settings/pipelines`} className="underline" data-testid="settings-stages-create-link">
            สร้าง pipeline ก่อน
          </Link>
        </p>
      ) : (
        <StageSettings key={pipe.id} systemId={id} pipeline={pipe} pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))} customFields={layout.filter((f) => !f.isSystem).map((f) => ({ key: f.key, label: f.label }))} />
      )}
    </div>
  );
}
