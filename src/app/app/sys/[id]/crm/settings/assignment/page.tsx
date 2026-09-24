import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { pageData } from "@/lib/modules/crm/assignment";
import {
  ASSIGN_CONDITION_FIELD_LABELS,
  ASSIGN_CONDITION_FIELDS,
  ASSIGN_CUSTOM_FIELD_PREFIX,
  ASSIGN_DELETE_REASON_MIN,
  ASSIGN_LANGUAGES,
  ASSIGN_MAX_OPEN_MAX,
  ASSIGN_MAX_OPEN_MIN,
  ASSIGN_MODE_HINTS,
  ASSIGN_MODE_LABELS,
  ASSIGN_MODES,
  ASSIGN_OP_LABELS,
  ASSIGN_OPS,
  ASSIGN_RULE_NAME_MAX,
  ASSIGN_SIMULATE_MAX_ROWS,
  describeAssignConditions,
} from "@/lib/modules/crm/assignment-shared";
import { CONTACT_SOURCE_LABEL, CONTACT_SOURCES } from "@/lib/modules/crm/contacts-shared";
import { COMPANY_SIZE_LABEL, COMPANY_SIZES } from "@/lib/modules/crm/companies-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { CrmAssignmentManager } from "@/components/crm/assignment/CrmAssignmentManager";
import type { CrmAssignOption, CrmAssignPageData } from "@/components/crm/assignment/types";

// มอบหมาย lead อัตโนมัติ (ใบ C2.3 · พิมพ์เขียว §5.7 §11.5 · ภาพ 07 ขวา) — `/app/sys/{id}/crm/settings/assignment`
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.assignment.manage` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร (ป้าย "คิวถัดไป" เป็นการทำนาย — ไม่เลื่อน rrCursor)
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ ทะเบียนโหมด/เงื่อนไข/ป้าย/เพดานถูกแปลงเป็น props ที่นี่
//    (หน้านี้อยู่ใน self-dir ของ CRM จึง import ไฟล์ `*-shared` ได้ตรง ๆ — ทะเบียนตัวเดียวกับเอนจิน ไม่มีการพิมพ์ซ้ำ)
export default async function CrmAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.assignment.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const d = await pageData(ctx, actor);

  const conditionFields: CrmAssignOption[] = [
    ...ASSIGN_CONDITION_FIELDS.map((f) => ({ value: f as string, label: ASSIGN_CONDITION_FIELD_LABELS[f] })),
    ...d.contactFields.map((f) => ({ value: `${ASSIGN_CUSTOM_FIELD_PREFIX}${f.key}`, label: `${f.label} (ฟิลด์กำหนดเอง)` })),
  ];
  const fieldLabel = (field: string): string => conditionFields.find((f) => f.value === field)?.label ?? field;
  const data: CrmAssignPageData = {
    systemId: id,
    rules: d.rules.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      modeLabel: ASSIGN_MODE_LABELS[r.mode],
      userIds: r.userIds,
      teamId: r.teamId,
      maxOpenPerUser: r.maxOpenPerUser,
      conditions: { mode: r.conditions.mode, items: r.conditions.items.map((c) => ({ field: c.field, op: c.op as string, value: c.value })) },
      summary: describeAssignConditions(r.conditions, fieldLabel),
      sortOrder: r.sortOrder,
      active: r.active,
      nextUserId: r.nextUserId,
      candidateIds: r.candidateIds,
    })),
    fallbackUserId: d.fallbackUserId,
    users: d.users,
    timeOffAware: d.timeOffAware === true, // B1-bis: false = ผู้ดูคนนี้ไม่เห็นข้อมูลวันลา ⇒ คิวถัดไป/ทดลอง ไม่คิดเรื่องวันลา

    teams: d.teams,
    modes: ASSIGN_MODES.map((m) => ({ value: m as string, label: ASSIGN_MODE_LABELS[m], hint: ASSIGN_MODE_HINTS[m] })),
    ops: ASSIGN_OPS.map((o) => ({ value: o as string, label: ASSIGN_OP_LABELS[o] })),
    conditionFields,
    customFieldPrefix: ASSIGN_CUSTOM_FIELD_PREFIX,
    sources: CONTACT_SOURCES.map((s) => ({ value: s as string, label: CONTACT_SOURCE_LABEL[s] })),
    sizes: COMPANY_SIZES.map((s) => ({ value: s as string, label: COMPANY_SIZE_LABEL[s] })),
    languages: ASSIGN_LANGUAGES.map((l) => ({ value: l.value, label: l.label })),
    // ทุกเพดานมาจากทะเบียนของเอนจิน (ไม่พิมพ์เลขซ้ำ — `simMax` เคยเป็น 20 ลอย ๆ ขณะที่ของจริงคือ 200)
    limits: {
      nameMax: ASSIGN_RULE_NAME_MAX,
      maxOpenMin: ASSIGN_MAX_OPEN_MIN,
      maxOpenMax: ASSIGN_MAX_OPEN_MAX,
      deleteReasonMin: ASSIGN_DELETE_REASON_MIN,
      simMax: ASSIGN_SIMULATE_MAX_ROWS,
    },
  };
  const def = systemDef(sys.type);
  return (
    <div className="flex min-w-0 max-w-5xl flex-col gap-4">
      <PageHeader
        title={`${def?.icon ?? ""} ${sys.name}`.trim()}
        back={{ href: `/app/sys/${id}/crm/settings`, label: "ตั้งค่า CRM" }}
        desc="มอบหมายอัตโนมัติ — lead ใหม่ทุกทางเข้า (ฟอร์ม · แชท · ระบบภายนอก) เข้ามือคนขายเองตามกฎที่ตั้งไว้ ไม่ต้องมีใครมานั่งแจก"
      />
      <ModuleTabs items={crmNavItems(id)} />
      <CrmAssignmentManager data={data} />
    </div>
  );
}
