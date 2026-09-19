import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { listTeams } from "@/lib/core/teams";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { policies } from "@/lib/modules/crm/visibility";
import {
  CRM_VIS_DEFAULT,
  CRM_VIS_ENTITIES,
  CRM_VIS_ENTITY_LABEL,
  CRM_VIS_LEVELS,
  CRM_VIS_LEVEL_LABEL,
  CRM_VIS_ROLES,
  CRM_VIS_ROLE_LABEL,
  isVisLevel,
  type CrmVisEntity,
  type CrmVisLevel,
} from "@/lib/modules/crm/visibility-shared";
import { listPipelines } from "@/lib/modules/crm/pipelines";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { VisibilitySettings, type MatrixCell, type MatrixRow, type OverrideRow } from "@/components/crm/settings/VisibilitySettings";

// การมองเห็นข้อมูล (CRM v2 · ใบ C1.7 · พิมพ์เขียว §6.2 · มติ C9 · ภาพ 10 ซ้ายกลาง) — `/app/sys/{id}/crm/settings/visibility`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.visibility.manage` (OWNER หรือได้รับชัดเจน) = notFound()
// 🔴 ตาราง บทบาท × ชนิดข้อมูล = policy ระดับบทบาท (ไม่ระบุทีม/pipeline) ของ `visibility.policies` · ค่าที่ไม่ได้ตั้งแสดงที่มา
//    (ค่าของร้านใน settings.crm.visibility หรือค่าเริ่มต้น C9) · รายการทับต่อทีม/pipeline อยู่ใต้ตาราง · หน้า GET ไม่เขียนอะไร
export default async function VisibilitySettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId: tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.visibility.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const [rows, teams, pipes] = await Promise.all([policies.list(ctx, actor), listTeams({ tenantId }), listPipelines(ctx, actor)]);

  // ค่าของร้าน (settings.crm.visibility — สตริงต่อบทบาท หรืออ็อบเจกต์ต่อชนิดข้อมูล)
  const raw = sys.settings && typeof sys.settings === "object" && !Array.isArray(sys.settings) ? (sys.settings as Record<string, unknown>).crm : null;
  const shopVis = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).visibility : null;
  const shopLevel = (role: string, e: CrmVisEntity): CrmVisLevel | null => {
    if (!shopVis || typeof shopVis !== "object" || Array.isArray(shopVis)) return null;
    const v = (shopVis as Record<string, unknown>)[role];
    if (isVisLevel(v)) return v;
    if (v && typeof v === "object" && !Array.isArray(v) && isVisLevel((v as Record<string, unknown>)[e])) return (v as Record<string, unknown>)[e] as CrmVisLevel;
    return null;
  };

  const matrix: MatrixRow[] = [
    ...CRM_VIS_ROLES.map((role) => ({
      key: role,
      label: role === "STAFF" ? "พนักงานขาย" : "ผู้จัดการ",
      editable: true,
      cells: CRM_VIS_ENTITIES.map((e): MatrixCell => {
        const p = rows.find((r) => r.role === role && !r.teamId && !r.pipelineId && r.entity === e);
        if (p) return { entity: e, level: p.visibility, source: "policy", policyId: p.id };
        const s = shopLevel(role, e);
        if (s) return { entity: e, level: s, source: "settings", policyId: null };
        return { entity: e, level: CRM_VIS_DEFAULT[role][e], source: "default", policyId: null };
      }),
    })),
  ];
  // หัวหน้าทีม (STAFF ที่เป็น LEAD) = อย่างน้อย TEAM ทุกชนิด (C9) — ระดับของพนักงานขายที่กว้างกว่า (ALL) ใช้กับหัวหน้าด้วย
  //   (แสดงค่าที่มีผลจริงตาม visibility.ts#baseLevel) · เจ้าของร้าน ALL เสมอ
  const staffRow = matrix.find((r) => r.key === "STAFF");
  const leadCell = (e: CrmVisEntity): MatrixCell => {
    const st = staffRow?.cells.find((c) => c.entity === e);
    return st && st.level === "ALL" ? { entity: e, level: "ALL", source: st.source, policyId: null } : { entity: e, level: "TEAM", source: "default", policyId: null };
  };
  const fixed: MatrixRow[] = [
    { key: "LEAD", label: "หัวหน้าทีม", editable: false, cells: CRM_VIS_ENTITIES.map(leadCell) },
    { key: "OWNER", label: "เจ้าของร้าน", editable: false, cells: CRM_VIS_ENTITIES.map((e) => ({ entity: e, level: "ALL" as const, source: "default" as const, policyId: null })) },
  ];
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const pipeName = new Map(pipes.map((p) => [p.id, p.name]));
  const overrides: OverrideRow[] = rows
    .filter((r) => r.teamId || r.pipelineId)
    .map((r) => ({
      id: r.id,
      team: r.teamId ? (teamName.get(r.teamId) ?? "ทีมที่เก็บถาวรแล้ว") : "ทุกทีม",
      pipeline: r.pipelineId ? (pipeName.get(r.pipelineId) ?? "pipeline ที่ไม่มีแล้ว") : "ทุก pipeline",
      role: r.role ? (r.role === "STAFF" ? "พนักงานขาย" : r.role === "MANAGER" ? "ผู้จัดการ" : "เจ้าของร้าน (ไม่มีผล — เห็นทั้งหมดเสมอ)") : "ทุกบทบาท",
      entity: CRM_VIS_ENTITY_LABEL[r.entity],
      level: CRM_VIS_LEVEL_LABEL[r.visibility],
    }));
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-4xl flex-col gap-4" data-testid="settings-visibility-page">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings/pipelines`, label: "ตั้งค่า pipeline" }}
        desc="การมองเห็นข้อมูล — ใครเห็นผู้ติดต่อ บริษัท ดีล และกิจกรรมของใคร (ของตัวเอง · ทั้งทีม · ทั้งร้าน)"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <VisibilitySettings
        systemId={id}
        matrix={matrix}
        fixed={fixed}
        overrides={overrides}
        entities={CRM_VIS_ENTITIES.map((e) => ({ value: e, label: CRM_VIS_ENTITY_LABEL[e] }))}
        levels={CRM_VIS_LEVELS.map((l) => ({ value: l, label: CRM_VIS_LEVEL_LABEL[l] }))}
        roles={CRM_VIS_ROLES.map((r) => ({ value: r, label: CRM_VIS_ROLE_LABEL[r] }))}
        teams={teams.map((t) => ({ value: t.id, label: t.name }))}
        pipelines={pipes.filter((p) => !p.archivedAt).map((p) => ({ value: p.id, label: p.name }))}
      />
    </div>
  );
}
