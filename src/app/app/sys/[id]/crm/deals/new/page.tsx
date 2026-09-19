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
import { companyContactOptions, companyRef, ownerOptions, pipelineOptions } from "@/lib/modules/crm/deals";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { NewDealForm } from "../_components/NewDealForm";

// เพิ่มดีล (CRM v2 · ใบ C1.5 · §5.4 createDeal) — `/app/sys/{id}/crm/deals/new`
// ?companyId= (มาจากบริษัท 360 "เปิดดีลใหม่" ผ่าน /deals?companyId=) · ?pipeline= · ?stage= (ปุ่ม + ของคอลัมน์บนกระดาน)
// 🔴 companyId จาก URL ถูก resolve ใหม่ฝั่งเซิร์ฟเวอร์ (companyWhere · ยังใช้งาน) — ไม่พบ = ไม่เติม (ไม่บอกว่ามีอยู่ที่อื่นไหม)
// 🔴 404-not-403: ระบบที่ไม่ใช่ CRM ของร้านนี้ = notFound() · หน้า GET ไม่เขียนอะไร
export default async function NewDealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const companyId = one("companyId");
  const [pipelines, owners, company] = await Promise.all([pipelineOptions(ctx, actor), ownerOptions(ctx, actor), companyId ? companyRef(ctx, actor, companyId) : Promise.resolve(null)]);
  const companyContacts = company ? await companyContactOptions(ctx, actor, company.id) : [];
  const pipe = pipelines.find((p) => p.id === one("pipeline")) ?? pipelines[0];
  const stage = pipe?.stages.find((s) => s.id === one("stage") && s.kind === "OPEN");
  const def = systemDef(sys.type);
  const canSettings = crmCan({ role: auth.active.role as Role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> }, "crm.settings.manage");
  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4" data-testid="deal-new-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/deals`, label: "กระดานดีล" }}
        desc={company ? `เพิ่มดีลของ ${company.name}` : "เพิ่มดีล — เลือกผู้ติดต่อ บริษัท และขั้นเริ่มต้น"}
      />
      <ModuleTabs items={crmNavItems(id)} />
      {pipelines.length === 0 ? (
        <div className="card flex flex-col items-start gap-2 p-4 text-sm" data-testid="deal-new-no-pipeline">
          <p>ยังไม่มี pipeline ในระบบนี้ — {canSettings ? "สร้าง pipeline ก่อนแล้วค่อยเพิ่มดีล" : "ขอให้ผู้ดูแลระบบ CRM สร้าง pipeline ก่อน"}</p>
          {canSettings && (
            <Link href={`/app/sys/${id}/crm/settings/pipelines`} className="btn btn-primary text-sm" data-testid="deal-new-create-pipeline">
              ไปตั้งค่า pipeline
            </Link>
          )}
        </div>
      ) : (
        <NewDealForm
          systemId={id}
          pipelines={pipelines}
          owners={owners}
          defaultOwner={auth.user.id}
          defaultPipelineId={pipe?.id ?? ""}
          defaultStageId={stage?.id ?? ""}
          company={company}
          companyContacts={companyContacts}
        />
      )}
    </div>
  );
}
