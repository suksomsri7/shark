import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { listSequences } from "@/lib/modules/crm/sequences";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { getMinuteJobStatus } from "@/lib/platform/minute-jobs";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { SequenceListView } from "@/components/crm/sequences/SequenceListView";

// ลำดับการติดตาม (CRM v2 · ใบ C2.2 · พิมพ์เขียว §5.7 · ภาพ 07 ล่าง) — `/app/sys/{id}/crm/settings/sequences`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 (requireCrmV2Page) · ไม่มีคีย์ `crm.sequence.manage/enroll` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร · ทุกการเขียนไปทาง server action ของโฟลเดอร์นี้ (actions.ts → บริการ sequences.ts)

export default async function CrmSequencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  const canManage = crmCan(actor, "crm.sequence.manage");
  if (!canManage && !crmCan(actor, "crm.sequence.enroll")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [rows, jobs] = await Promise.all([listSequences(ctx, actor), getMinuteJobStatus(["crm.sequences"]).catch(() => [])]);
  // ตัวจับเวลาของระบบ (crm-cron.mts บน VPS · ติดตั้งในใบ C6.1) ยังไม่เดิน = ขั้นที่ถึงเวลาไม่ถูกทำ — บอกเจ้าของร้านตรง ๆ
  const lastRun = jobs.find((j) => j.name === "crm.sequences")?.lastRunAt?.getTime() ?? 0;
  const timerStale = Date.now() - lastRun > 2 * 3_600_000;
  const def = systemDef(sys.type);

  return (
    <div className="flex min-w-0 max-w-4xl flex-col gap-4" data-testid="crm-sequences-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="ลำดับการติดตาม — ตั้งขั้นไว้ครั้งเดียว (อีเมล · LINE · งานติดตาม · รอ) แล้วระบบทำตามเวลาให้เอง และหยุดเองเมื่อลูกค้าตอบกลับหรือดีลปิด"
      />
      <ModuleTabs items={crmNavItems(id)} />
      {timerStale && (
        <p className="card p-3 text-sm" style={{ borderColor: "var(--color-danger)" }} role="alert" data-testid="crm-sequences-timer-stale">
          ตัวจับเวลาของระบบยังไม่เดินในช่วง 2 ชั่วโมงที่ผ่านมา — ขั้นที่ถึงเวลาจะยังไม่ถูกทำจนตัวจับเวลากลับมาเดิน
        </p>
      )}
      <SequenceListView
        systemId={id}
        canManage={canManage}
        rows={rows.map((r) => ({
          id: r.id,
          name: r.name,
          version: r.version,
          active: r.active,
          stepCount: r.stepCount,
          steps: r.steps,
          counts: r.counts,
          updatedAt: r.updatedAt,
        }))}
      />
    </div>
  );
}
