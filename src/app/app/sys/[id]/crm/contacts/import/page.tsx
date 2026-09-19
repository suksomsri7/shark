import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { customFieldLayout } from "@/lib/modules/crm/contacts";
import { IMPORT_DUPLICATE_LABEL, IMPORT_DUPLICATE_MODES, IMPORT_TARGETS, IMPORT_TARGET_LABEL } from "@/lib/modules/crm/contacts-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { ContactImportPanel } from "../_components/ContactImportPanel";

// นำเข้าผู้ติดต่อ + บริษัท (CRM v2 · ใบ C1.11 · §3.17) — `/app/sys/{id}/crm/contacts/import`
// 🔴 404-not-403: ระบบที่ไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM ใหม่ · ไม่มีคีย์ `crm.contact.import` = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร · ตัวนำเข้าจริงคือ action นำเข้าของผู้ติดต่อ (บริการ C1.4: 10 MB · ครั้งละ 5,000 แถว · เพดานบริการ 50,000)
export default async function ContactImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" }, select: { id: true, name: true } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.contact.import")) notFound();
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const customFields = await customFieldLayout(ctx, actor).catch(() => []);
  const targets = [
    ...IMPORT_TARGETS.map((t) => ({ value: t, label: IMPORT_TARGET_LABEL[t] })),
    ...customFields.map((f) => ({ value: `f.${f.key}`, label: `ฟิลด์: ${f.label}` })),
  ];
  const modes = IMPORT_DUPLICATE_MODES.map((m) => ({ value: m, label: IMPORT_DUPLICATE_LABEL[m] }));
  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4" data-testid="crm-import-page">
      <PageHeader title="นำเข้าผู้ติดต่อ" back={{ href: `/app/sys/${id}/crm/contacts`, label: "รายชื่อผู้ติดต่อ" }} desc={`${sys.name} · ผู้ติดต่อและบริษัทในไฟล์เดียว — คอลัมน์ "บริษัท" สร้างบริษัทใหม่หรือผูกกับบริษัทที่มีอยู่ให้`} />
      <ModuleTabs items={crmNavItems(id)} />
      <ul className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        {modes.map((m) => (
          <li key={m.value}>
            {m.label}
            {m.value === "update" ? " — เติมเฉพาะช่องที่คนเดิมยังว่าง ไม่ทับค่าที่มีอยู่" : m.value === "skip" ? " — ไม่แตะคนเดิม" : " — เพิ่มเป็นคนใหม่ แล้วไปรวมทีหลังที่หน้าคู่ที่น่าจะซ้ำ"}
          </li>
        ))}
      </ul>
      <ContactImportPanel systemId={id} targets={targets} modes={modes} />
    </div>
  );
}
