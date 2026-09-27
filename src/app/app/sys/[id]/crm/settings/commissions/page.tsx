import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { getCommissionSettings, listRules, pending } from "@/lib/modules/crm/commissions";
import {
  COMMISSION_BASIS_LABELS,
  COMMISSION_KIND_LABELS,
  COMMISSION_LIMITS,
  COMMISSION_PAYROLL_LABELS,
  COMMISSION_REWON_LABEL,
  COMMISSION_STATUS_LABELS,
  COMMISSION_WAITING_LABEL,
  type CommissionDto,
} from "@/lib/modules/crm/commissions-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { CrmCommissionSettings } from "@/components/crm/commissions/CrmCommissionSettings";
import type { CrmCommissionRowView, CrmCommissionSettingsData } from "@/components/crm/commissions/types";

// คอมมิชชัน — กฎ + รายการรออนุมัติ (ใบ C3.3 · พิมพ์เขียว §5.9 · ภาพ 10 ขวา) — `/app/sys/{id}/crm/settings/commissions`
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ (type: "CRM") · ยังไม่เปิด CRM v2 · ไม่มีทั้ง `crm.settings.manage`
//    และ `crm.commission.approve` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร · ข้อมูลโหลดผ่านบริการ (listRules · pending) — ไม่คำนวณเงินซ้ำในคอมโพเนนต์
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ ป้ายไทย/เพดานถูกแปลงเป็น props ที่นี่
export default async function CrmCommissionSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  const canManage = crmCan(actor, "crm.settings.manage");
  const canApprove = crmCan(actor, "crm.commission.approve");
  if (!canManage && !canApprove) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [rules, rows, pipelines, settings] = await Promise.all([
    listRules(ctx, actor),
    canApprove ? pending(ctx, actor) : Promise.resolve([] as CommissionDto[]),
    prisma.crmPipeline.findMany({ where: { tenantId, systemId: id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true }, take: 200 }),
    getCommissionSettings(ctx, actor),
  ]);
  const pipeName = new Map(pipelines.map((p) => [p.id, p.name]));
  const rowView = (r: CommissionDto): CrmCommissionRowView => ({
    id: r.id,
    dealId: r.dealId,
    dealTitle: r.dealTitle ?? "(ดีลถูกลบ)",
    userName: r.userName || "—",
    amountSatang: r.amountSatang,
    status: r.status,
    statusLabel: COMMISSION_STATUS_LABELS[r.status],
    basisLabel: COMMISSION_BASIS_LABELS[r.basis],
    periodKey: r.periodKey,
    payroll: r.payroll,
    payrollLabel: r.payroll ? COMMISSION_PAYROLL_LABELS[r.payroll] : null,
    rewon: r.rewon,
    isReversal: !!r.reversedOfId,
  });
  const data: CrmCommissionSettingsData = {
    systemId: id,
    settings: { approvalRequired: settings.approvalRequired, payrollLink: settings.payrollLink, basis: settings.basis },
    canManage,
    canApprove,
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      basis: r.basis,
      basisLabel: COMMISSION_BASIS_LABELS[r.basis],
      kind: r.kind,
      kindLabel: COMMISSION_KIND_LABELS[r.kind],
      description: r.description,
      pipelineId: r.pipelineId,
      pipelineName: r.pipelineId ? pipeName.get(r.pipelineId) ?? null : null,
      pctBp: r.config.pctBp ?? null,
      fixedSatang: r.config.fixedSatang ?? null,
      tiers: r.config.tiers ?? [],
      minDealSatang: r.minDealSatang,
      splitCollaboratorsBp: r.splitCollaboratorsBp,
      payoutDelayDays: r.payoutDelayDays,
      active: r.active,
    })),
    pending: rows.map(rowView),
    pipelines: pipelines.map((p) => ({ value: p.id, label: p.name })),
    bases: (["PAID", "WON"] as const).map((b) => ({ value: b, label: COMMISSION_BASIS_LABELS[b] })),
    kinds: (["PCT", "FIXED", "TIERED"] as const).map((k) => ({ value: k, label: COMMISSION_KIND_LABELS[k] })),
    waitingLabel: COMMISSION_WAITING_LABEL,
    rewonLabel: COMMISSION_REWON_LABEL,
    limits: { nameMax: COMMISSION_LIMITS.nameMax, reasonMin: COMMISSION_LIMITS.reasonMin, tiersMax: COMMISSION_LIMITS.tiersMax, delayDaysMax: COMMISSION_LIMITS.delayDaysMax },
  };
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="คอมมิชชัน — ตั้งกฎจ่ายค่าคอมให้ทีมขาย (เมื่อรับเงินหรือเมื่อปิดการขาย) แล้วอนุมัติรายการที่เกิดขึ้น ส่งเข้างวดเงินเดือนได้ในคลิกเดียว"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <CrmCommissionSettings data={data} />
    </div>
  );
}
