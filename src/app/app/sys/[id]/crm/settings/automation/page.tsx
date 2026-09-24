import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { builderOptions, listRules, listRuns, usageThisMonth } from "@/lib/modules/crm/automation";
import {
  CRM_ACTION_LABELS,
  CRM_ACTION_TYPES,
  CRM_CONDITION_FIELDS,
  CRM_CONDITION_OP_LABELS,
  CRM_CONDITION_OPS,
  CRM_MAX_ACTIONS,
  CRM_MAX_WAIT_DAYS,
  CRM_RULE_TRIGGERS,
  CRM_SCORE_BAND_LABELS,
  CRM_SCORE_BANDS,
  CRM_VALUELESS_OPS,
  describeCrmActions,
  describeCrmTrigger,
} from "@/lib/modules/crm/automation-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { getMinuteJobStatus } from "@/lib/platform/minute-jobs";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { CrmAutomationBuilder } from "@/components/crm/automation/CrmAutomationBuilder";
import type { CrmAutomationPageData } from "@/components/crm/automation/types";

// กฎอัตโนมัติ CRM (ใบ C2.1 · พิมพ์เขียว §7.3 · ภาพ 07 บน) — `/app/sys/{id}/crm/settings/automation`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.automation.manage` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร (กฎเริ่มต้นสร้างเมื่อกดปุ่มเท่านั้น) · ตัวสร้างกฎฝั่ง client ได้ทะเบียนเป็น props (ไม่แตะโมดูล CRM ตรง)
const PREFIX_LABEL: Record<"c" | "co" | "d", string> = { c: "ผู้ติดต่อ", co: "บริษัท", d: "ดีล" };

export default async function CrmAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.automation.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [rules, runs, usage, opts, jobs] = await Promise.all([
    listRules(ctx, actor),
    listRuns(ctx, actor),
    usageThisMonth(ctx),
    builderOptions(ctx, actor),
    getMinuteJobStatus(["crm.automation.waits", "crm.automation.cron"]).catch(() => []),
  ]);
  // SF-4: ตัวจับเวลาของระบบ (crm-cron.mts บน VPS · ติดตั้งในใบ C6.1) ยังไม่เดิน = ขั้น "รอ" และกฎตามเวลาไม่ทำงาน — บอกเจ้าของร้านตรง ๆ
  //   อ่านบันทึกรอบที่ minute-jobs เขียนไว้เอง (lastRunAt) · รอ > 2 ชม. หรือ cron รายวัน > 26 ชม. (หรือไม่เคยเดิน) = แสดงคำเตือน
  const nowMs = Date.now();
  const lastRun = (name: string) => jobs.find((j) => j.name === name)?.lastRunAt?.getTime() ?? 0;
  const timerStale = nowMs - lastRun("crm.automation.waits") > 2 * 3_600_000 || nowMs - lastRun("crm.automation.cron") > 26 * 3_600_000;

  const conditionFields: { value: string; label: string }[] = [];
  for (const prefix of ["c", "co", "d"] as const) {
    for (const [col, label] of Object.entries(CRM_CONDITION_FIELDS[prefix])) conditionFields.push({ value: `${prefix}.${col}`, label: `${PREFIX_LABEL[prefix]} · ${label}` });
  }
  for (const f of opts.contactFields) conditionFields.push({ value: `f.${f.key}`, label: `ผู้ติดต่อ · ${f.label} (ฟิลด์กำหนดเอง)` });
  for (const o of opts.objects) conditionFields.push({ value: `o.${o.key}`, label: `มี${o.label}` });

  const data: CrmAutomationPageData = {
    systemId: id,
    triggers: CRM_RULE_TRIGGERS.map((t) => ({ value: t.value, label: t.label, group: t.group, cron: t.cron === true, params: [...(t.params ?? [])] })),
    actions: CRM_ACTION_TYPES.map((a) => ({ value: a, label: CRM_ACTION_LABELS[a] })),
    conditionFields,
    ops: CRM_CONDITION_OPS.map((o) => ({ value: o, label: CRM_CONDITION_OP_LABELS[o], valueless: CRM_VALUELESS_OPS.has(o) })),
    bands: CRM_SCORE_BANDS.map((b) => ({ id: b, name: CRM_SCORE_BAND_LABELS[b] ?? b })),
    pipelines: opts.pipelines,
    users: opts.users,
    boards: opts.boards,
    objects: opts.objects,
    contactFields: opts.contactFields,
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      trigger: r.trigger,
      conditions: r.conditions,
      actions: r.actions,
      pipelineId: r.pipelineId,
      starterKey: r.starterKey,
      runsTotal: r.runsTotal,
      runsThisMonth: r.runsThisMonth,
      lastRunAt: r.lastRunAt,
      summary: `${describeCrmTrigger(r.trigger)} · ${describeCrmActions(r.actions)}`,
    })),
    runs: runs.map((r) => ({ id: r.id, ruleName: r.ruleName, status: r.status, detail: r.detail, at: r.at })),
    usage,
    maxActions: CRM_MAX_ACTIONS,
    maxWaitDays: CRM_MAX_WAIT_DAYS,
    timerStale,
  };
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4" data-testid="crm-automation-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="กฎอัตโนมัติ — เมื่อเกิดเหตุการณ์กับผู้ติดต่อ ดีล หรือกิจกรรม ให้ระบบทำงานต่อให้เอง (ประโยคไทย ไม่ต้องเขียนโค้ด)"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <CrmAutomationBuilder data={data} />
    </div>
  );
}
