import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { fields, toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import * as objects from "@/lib/modules/crm/objects";
import { OBJECT_PARENT_LABEL, OBJECT_TEMPLATES, OBJECT_WARN_AT } from "@/lib/modules/crm/objects-shared";
import {
  archiveObjectFieldAction,
  createObjectFieldAction,
  createObjectSectionAction,
  deleteObjectSectionAction,
  reorderObjectFieldsAction,
  reorderObjectSectionsAction,
  restoreObjectFieldAction,
  updateObjectFieldAction,
  updateObjectSectionAction,
} from "@/lib/modules/crm/objects-actions";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { FieldDesigner, type FieldDesignerObject } from "@/components/member/FieldDesigner";
import { AddObjectForm, ObjectList } from "./_components/ObjectsAdmin";
import type { ObjectListItem, ObjectTemplateChip } from "@/components/crm/objects/types";

// ตั้งค่า — วัตถุกำหนดเอง (CRM v2 · ใบ C1.9 · พิมพ์เขียว §3.6 §11.2 · ภาพ ledger/design-crm/06-custom-objects.png) — `/app/sys/{id}/crm/settings/objects`
// URL state: ?object=<contact|company|deal|key ของวัตถุ> (วัตถุที่กำลังออกแบบฟิลด์)
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.object.manage` (OWNER · MANAGER ที่ได้รับชัดเจน) = notFound()
// 🔴 ทุกข้อมูลวัตถุมาจากบริการ C1.2b (`objects.list/warnings`) · ฟิลด์จาก engine ตัวเดียว (`fields.listLayout` + objectKey) · หน้า GET ไม่เขียน

const BUILTINS: { key: string; label: string }[] = [
  { key: "contact", label: "ผู้ติดต่อ (ข้อมูลหลัก)" },
  { key: "company", label: "บริษัท (ข้อมูลหลัก)" },
  { key: "deal", label: "ดีล (ข้อมูลหลัก)" },
];

export default async function ObjectsSettingsPage({
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
  // AUDIT-CLASS X2: ด่านคีย์เดียวกับ action ออกแบบวัตถุ (MANAGER ปริยายไม่มี crm.object.manage — §6.1) · ไม่มี = 404
  if (!crmCan(actor, "crm.object.manage")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  const [all, warn, fieldCounts] = await Promise.all([
    objects.list(ctx, actor, { includeArchived: true }),
    objects.warnings(ctx, actor),
    prisma.memberField.groupBy({ by: ["objectKey"], where: { tenantId, systemId: id, archivedAt: null, isSystem: false }, _count: { _all: true } }),
  ]);
  const countOf = new Map(fieldCounts.map((r) => [r.objectKey, r._count._all]));
  const items: ObjectListItem[] = all.map((o) => ({
    key: o.key,
    label: o.label,
    labelPlural: o.labelPlural,
    parentType: o.parentType,
    parentLabel: OBJECT_PARENT_LABEL[o.parentType],
    titleFieldKey: o.titleFieldKey,
    showAsTab: o.showAsTab,
    portalVisible: o.portalVisible,
    recordCount: o.recordCount,
    fieldCount: countOf.get(o.key) ?? 0,
    archived: !!o.archivedAt,
    templateKey: o.templateKey,
  }));
  const live = items.filter((o) => !o.archived);
  const templates: ObjectTemplateChip[] = OBJECT_TEMPLATES.map((t) => ({
    key: t.key,
    label: t.label,
    labelPlural: t.labelPlural,
    icon: t.icon,
    parentType: t.parentType,
    titleFieldKey: t.titleFieldKey,
    description: t.description,
    titleChoices: t.sections.flatMap((s) => s.fields).filter((f) => f.type === "TEXT").map((f) => ({ key: f.key, label: f.label })),
  }));

  // วัตถุที่กำลังออกแบบ: ?object= ต้องเป็นข้อมูลหลัก 3 ชนิด หรือวัตถุที่ยังไม่เก็บถาวรของระบบนี้ — อย่างอื่น = บอกในหน้า แล้วเปิดตัวแรกแทน
  const base = `/app/sys/${id}/crm/settings/objects`;
  const wanted = typeof sp.object === "string" ? sp.object : "";
  const choices = [...BUILTINS, ...live.map((o) => ({ key: o.key, label: o.label }))];
  const valid = choices.some((c) => c.key === wanted);
  const selected = valid ? wanted : (live[0]?.key ?? "contact");
  const notice = wanted && !valid ? `ไม่พบวัตถุ "${wanted.slice(0, 40)}" ในระบบ CRM นี้ (อาจถูกเก็บถาวรไปแล้ว) — เปิด "${choices.find((c) => c.key === selected)?.label ?? selected}" แทน` : null;
  const layout = await fields.listLayout({ ...ctx, objectKey: selected, actor }, { includeArchived: true });
  const current = live.find((o) => o.key === selected) ?? null;

  const designer: FieldDesignerObject = {
    current: selected,
    options: choices.map((c) => ({ key: c.key, label: c.label, href: `${base}?object=${c.key}` })),
    actions: {
      createSectionAction: createObjectSectionAction,
      updateSectionAction: updateObjectSectionAction,
      deleteSectionAction: deleteObjectSectionAction,
      reorderSectionsAction: reorderObjectSectionsAction,
      createFieldAction: createObjectFieldAction,
      updateFieldAction: updateObjectFieldAction,
      archiveFieldAction: archiveObjectFieldAction,
      restoreFieldAction: restoreObjectFieldAction,
      reorderFieldsAction: reorderObjectFieldsAction,
    },
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="objects-settings-page">
      <PageHeader
        title="ตั้งค่า — วัตถุกำหนดเอง"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc={`ข้อมูลเฉพาะกิจการที่ผูกกับสมาชิก ผู้ติดต่อ บริษัท หรือดีล (เช่น รถ สัตว์เลี้ยง สัญญา) · ${live.length.toLocaleString("th-TH")} วัตถุ`}
      />
      <ModuleTabs items={crmNavItems(id)} />
      {warn.tooManyObjects && (
        <div className="card p-3 text-sm" role="status" data-testid="objects-warn-count">
          ระบบนี้มีวัตถุ {warn.objectCount.toLocaleString("th-TH")} วัตถุ (เกิน {OBJECT_WARN_AT}) — ยังใช้งานได้ปกติ แต่หน้ารายการและตัวกรองอาจช้าลง
        </div>
      )}
      {notice && (
        <div className="card p-3 text-sm" role="status" data-testid="objects-select-notice">
          {notice}
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ObjectList systemId={id} items={items} selected={selected} baseHref={base} />
          <AddObjectForm systemId={id} baseHref={base} takenKeys={all.map((o) => o.key)} templates={templates} />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {current && (
            <section className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-testid="objects-current">
              <span className="min-w-0">
                <b>{current.label}</b> · ผูกกับ {current.parentLabel} · {current.recordCount.toLocaleString("th-TH")} รายการ · ชื่อรายการจากฟิลด์ &quot;{current.titleFieldKey}&quot;
                {current.showAsTab ? ` · เป็นแท็บในหน้า 360 ของ${current.parentLabel}` : ""}
              </span>
              <Link href={`/app/sys/${id}/crm/objects/${current.key}`} className="btn btn-ghost btn-sm" data-testid="object-open-list-link">
                เปิดรายการ
              </Link>
            </section>
          )}
          <FieldDesigner key={selected} systemId={id} initialSections={layout.sections} templates={[]} object={designer} />
        </div>
      </div>
    </div>
  );
}
