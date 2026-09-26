import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { integrationStatus, targetPicker } from "@/lib/modules/crm/integrations";
import { INTEGRATION_HINTS, INTEGRATION_MAP_ORDER, INTEGRATION_WINDOW_DAYS } from "@/lib/modules/crm/integrations-shared";
import { saveIntegrationTargetsAction } from "@/lib/modules/crm/integrations-actions";
import { thaiDateLabel, thaiTimeLabel } from "@/lib/modules/crm/activities-shared";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { IntegrationsOverview, type MapNode } from "@/components/crm/integrations/IntegrationsOverview";
import { TargetsForm, type TargetRow } from "@/components/crm/integrations/TargetsForm";
import { StatusTable, type StatusRow } from "@/components/crm/integrations/StatusTable";
import { JobsList, type JobRow } from "@/components/crm/integrations/JobsList";

// ตั้งค่า — การเชื่อมต่อทุกระบบ (ใบ C3.6 · พิมพ์เขียว §9 · ภาพ 17) — `/app/sys/{id}/crm/settings/integrations`
//   แผนผัง CRM กลาง ↔ 23 ระบบ (กล่องที่ยังไม่เปิดใช้เป็นเส้นประ + ป้าย "ไม่ได้เปิดใช้") · ระบบปลายทางเมื่อมีหลายระบบ (5 ชนิด) ·
//   ตารางสถานะ (เหตุการณ์ล่าสุด + จำนวน 7 วัน จาก outbox) · สุขภาพงานเบื้องหลัง (ทะเบียนงานรายนาที C0.5)
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.settings.manage` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร · บันทึกผ่าน action (jsonb_set คำสั่งเดียว + audit `crm.integrations.targets`)
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ ค่าที่ต้องแสดงถูกแปลงเป็น props ที่นี่ (ป้ายเวลาไทยคิดที่นี่) · action ส่งทาง props
// 🔴 390 px: แผนผังเป็นกริด 2 คอลัมน์ (CRM บนสุด) · ตารางสถานะอยู่ในกล่องเลื่อนแนวนอน · ไม่มีความกว้างตายตัว (R-D: C3.7 ไม่ครอบหน้านี้)
const whenLabel = (iso: string | null): string => {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `${thaiDateLabel(ms)} ${thaiTimeLabel(ms)}` : "—";
};

export default async function CrmIntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.settings.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const [status, picker] = await Promise.all([integrationStatus(ctx, actor), targetPicker(ctx, actor)]);
  const byCode = new Map(status.systems.map((r) => [r.code, r]));
  const others = status.systems.filter((r) => r.code !== "CRM");
  const nodes: MapNode[] = INTEGRATION_MAP_ORDER.map((code) => byCode.get(code))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      code: r.code,
      label: r.label,
      enabled: r.enabled,
      into: INTEGRATION_HINTS[r.code]?.into ?? "",
      out: INTEGRATION_HINTS[r.code]?.out ?? "",
      // กล่องที่เปิดอยู่ของ feature ระบบเดียว = ลิงก์เข้าระบบนั้น · หลายระบบ/หน้างาน = กล่องเฉย ๆ (ไม่เดาว่าจะไปไหน)
      href: r.enabled && r.kind === "feature" && r.systemIds.length === 1 ? `/app/sys/${r.systemIds[0]}` : null,
    }));
  const statusRows: StatusRow[] = others
    .filter((r) => r.enabled || r.lastEventAt)
    .map((r) => ({ code: r.code, label: r.label, enabled: r.enabled, lastEventType: r.lastEventType, lastLabel: whenLabel(r.lastEventAt), events7d: r.events7d }));
  // มติผู้ตรวจ C3.6 SF2: อ่านสถิติไม่ทัน ≠ "ไม่มีเหตุการณ์" — บอกตรง ๆ ว่าโหลดไม่ทัน
  const emptyLabel = status.eventsUnavailable ? "—" : `ไม่มีเหตุการณ์ใน ${INTEGRATION_WINDOW_DAYS} วัน`;
  const eventsNote = status.eventsUnavailable ? "โหลดสถิติเหตุการณ์ไม่ทัน — ลองใหม่ภายหลัง" : null;
  const jobs: JobRow[] = status.jobs.map((j) => ({
    name: j.name,
    every: j.everyMinutes === null ? "—" : j.everyMinutes >= 1440 ? `ทุก ${Math.round(j.everyMinutes / 1440)} วัน` : j.everyMinutes >= 60 ? `ทุก ${Math.round(j.everyMinutes / 60)} ชม.` : `ทุก ${j.everyMinutes} นาที`,
    lastRun: whenLabel(j.lastRunAt),
    lastOk: whenLabel(j.lastOkAt),
    // มติผู้ตรวจ C3.6 S1: ไม่มีรายละเอียดข้อผิดพลาดของงาน (ของทั้งแพลตฟอร์ม) — สถานะ + เหตุผลกลาง ๆ เท่านั้น
    state: !j.lastRunAt ? "never" : j.failed ? "failed" : "ok",
    reason: j.reason,
  }));
  // มติผู้ตรวจ C3.6 S4: "ใช้อยู่" มาจากผลของตัวตัดสินเสมอเมื่อค่าที่เลือกไม่ได้ถูกใช้ (ปิด/ถูกลบ/เลิกเชื่อม) — ไม่ใช่ค่าที่เก็บ
  //   SF3: บัญชีที่ได้มาแค่เพราะ "สมุดเดียวของร้าน" (ไม่ได้เชื่อมกับ CRM นี้) — CRM ไม่เขียนสมุดนั้น (companies ใช้เฉพาะ target/link)
  //   ⇒ ห้ามขึ้น "ใช้อยู่" ให้เข้าใจผิด · บอกว่ายังไม่ได้เชื่อมแทน
  const targets: TargetRow[] = picker.map((p) => {
    const accountOnly = p.kind === "account" && p.via === "only";
    return {
      kind: p.kind,
      label: p.label,
      stored: p.stored,
      stale: p.stale,
      autoName: p.via === "target" || accountOnly ? null : (p.candidates.find((c) => c.id === p.resolved)?.name ?? null),
      autoVia: p.via === "target" || accountOnly ? null : p.via,
      note: accountOnly ? "ยังไม่ได้เชื่อมสมุดกับ CRM นี้ — CRM จะไม่เขียนสมุดบัญชี" : null,
      candidates: p.candidates,
    };
  });
  const def = systemDef(sys.type);
  const crmNode = { name: sys.name, events7d: byCode.get("CRM")?.events7d ?? 0 };
  return (
    <div data-testid="crm-integrations-page" className="flex min-w-0 max-w-6xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="การเชื่อมต่อทุกระบบ — CRM อยู่กลาง รับเหตุการณ์จากทุกระบบของร้านและส่งงานกลับไป (ทุกเส้นผ่าน facade/outbox) · เลือกระบบปลายทางเมื่อร้านมีหลายระบบชนิดเดียวกัน"
      />
      <ModuleTabs items={crmNavItems(id, (k) => crmCan(actor, k))} />
      <IntegrationsOverview crm={crmNode} nodes={nodes} />
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <TargetsForm systemId={id} rows={targets} save={saveIntegrationTargetsAction} />
        <StatusTable rows={statusRows} emptyLabel={emptyLabel} windowDays={INTEGRATION_WINDOW_DAYS} note={eventsNote} />
      </div>
      <JobsList jobs={jobs} />
    </div>
  );
}
