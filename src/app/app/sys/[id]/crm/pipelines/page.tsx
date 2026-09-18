import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { evaluate } from "@/lib/core/rbac";
import type { Role } from "@prisma/client";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { listPipelines } from "@/lib/modules/crm/pipelines";
import { DEAL_KIND_LABEL } from "@/lib/modules/crm/deals-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// pipeline ทั้งหมด (CRM v2 · ใบ C1.5 · §2.2 เมนู "ดีล") — `/app/sys/{id}/crm/pipelines`
// อ่านอย่างเดียว: ขั้นของแต่ละ pipeline (+ %) · จำนวนดีลที่เปิดอยู่ · ทางไปกระดาน/ตั้งค่า
// 🔴 404-not-403: ระบบที่ไม่ใช่ CRM ของร้านนี้ = notFound() · หน้า GET ไม่เขียนอะไร
export default async function PipelinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const pipelines = await listPipelines(ctx, actor);
  // ปุ่มไปหน้าตั้งค่า = เฉพาะคนที่มี `crm.settings.manage` (หน้าตั้งค่าเป็น 404 สำหรับคนอื่น — ไม่โชว์ลิงก์ตาย)
  const canSettings = evaluate({ role: auth.active.role as Role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> }, { module: "crm", action: "crm.settings.manage" });
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="pipelines-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        desc="pipeline ทั้งหมด — ขั้นของงานขายแต่ละสาย และดีลที่ยังเปิดอยู่"
        actions={
          canSettings ? (
            <Link href={`/app/sys/${id}/crm/settings/pipelines`} className="btn btn-ghost text-sm" data-testid="pipelines-settings-link">
              ตั้งค่า pipeline
            </Link>
          ) : undefined
        }
      />
      <ModuleTabs items={crmNavItems(id)} />
      {pipelines.length === 0 ? (
        <p className="card p-4 text-sm text-[color:var(--color-muted)]" data-testid="pipelines-empty">
          {canSettings ? "ยังไม่มี pipeline — สร้างที่หน้าตั้งค่า pipeline" : "ยังไม่มี pipeline — ขอให้ผู้ดูแลระบบ CRM สร้าง pipeline ก่อน"}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {pipelines.map((p) => (
            <li key={p.id} className="card flex flex-col gap-3 p-4" data-testid={`pipelines-item-${p.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <span className="break-words">{p.name}</span>
                  {p.isDefault && <span className="rounded-md border px-1.5 text-xs font-normal text-[color:var(--color-muted)]">ค่าเริ่มต้น</span>}
                </span>
                <span className="text-sm text-[color:var(--color-muted)]">ดีลเปิด {p.openDeals.toLocaleString("th-TH")}</span>
              </div>
              <ol className="flex flex-wrap gap-1 text-xs">
                {p.stages.map((s) => (
                  <li key={s.id} className="rounded-full border px-2 py-0.5">
                    {s.name} · {s.kind === "OPEN" ? `${s.probability}%` : DEAL_KIND_LABEL[s.kind]}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Link href={`/app/sys/${id}/crm/deals?pipeline=${encodeURIComponent(p.id)}`} className="btn btn-primary text-sm" data-testid={`pipelines-open-board-${p.id}`}>
                  เปิดกระดาน
                </Link>
                <Link href={`/app/sys/${id}/crm/deals?pipeline=${encodeURIComponent(p.id)}&view=forecast`} className="btn btn-ghost text-sm" data-testid={`pipelines-open-forecast-${p.id}`}>
                  พยากรณ์
                </Link>
                {canSettings && (
                  <Link href={`/app/sys/${id}/crm/settings/stages?pipeline=${encodeURIComponent(p.id)}`} className="btn btn-ghost text-sm" data-testid={`pipelines-edit-stages-${p.id}`}>
                    แก้ขั้น
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
