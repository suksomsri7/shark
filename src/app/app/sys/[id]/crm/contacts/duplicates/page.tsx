import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { findDuplicates, mergeValuesFor } from "@/lib/modules/crm/contacts";
import { MERGE_CHOICE_FIELDS, MERGE_CHOICE_LABEL } from "@/lib/modules/crm/contacts-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { MergePairSheet, type MergeSide } from "../../_components/MergePairSheet";

// ผู้ติดต่อที่น่าจะซ้ำ (CRM v2 · ใบ C1.11 · §3.17 · §11.1) — `/app/sys/{id}/crm/contacts/duplicates`
// 🔴 404-not-403: ระบบที่ไม่ใช่ CRM ของร้านนี้ · ยังไม่เปิด CRM ใหม่ · ไม่มีคีย์ `crm.contact.merge` = notFound()
// 🔴 AUDIT-CLASS X1: คู่มาจาก findDuplicates (C1.4 — ผ่าน contactWhere) · ค่าที่ให้เลือกอ่านซ้ำผ่าน mergeValuesFor (contactWhere เดียวกัน)
//    คู่ที่มองไม่เห็นฝั่งใดฝั่งหนึ่ง = ไม่แสดงเลย · หน้า GET ไม่เขียนอะไร · รวมจริงผ่านแผ่นรวม (MergePairSheet · ยืนยัน + เหตุผล)
const REASON: Record<string, string> = { PHONE: "เบอร์เดียวกัน", EMAIL: "อีเมลเดียวกัน", NAME: "ชื่อเดียวกัน" };

export default async function ContactDuplicatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" }, select: { id: true, name: true } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.contact.merge")) notFound();
  const scope = { tenantId, systemId: id };
  const { items } = await findDuplicates({ ...scope, actorUserId: auth.user.id }, actor, { limit: 200 });
  const ids = [...new Set(items.flatMap((p) => [p.a, p.b]))];
  const rows = await mergeValuesFor({ ...scope, actorUserId: auth.user.id }, actor, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const side = (cid: string, name: string): MergeSide | null => {
    const r = byId.get(cid);
    return r ? { id: r.id, name: name || r.name, values: r.values } : null;
  };
  const pairs = items
    .map((p) => ({ a: side(p.a, p.aName), b: side(p.b, p.bName), reason: REASON[p.reason] ?? p.reason }))
    .filter((p): p is { a: MergeSide; b: MergeSide; reason: string } => !!p.a && !!p.b);
  const fields = MERGE_CHOICE_FIELDS.map((f) => ({ key: f, label: MERGE_CHOICE_LABEL[f] }));
  const base = `/app/sys/${id}/crm/contacts`;

  return (
    <div className="flex min-w-0 max-w-4xl flex-col gap-4" data-testid="crm-contact-duplicates-page">
      <PageHeader title="ผู้ติดต่อที่น่าจะซ้ำ" back={{ href: base, label: "รายชื่อผู้ติดต่อ" }} desc={`${sys.name} · จับคู่จากเบอร์ อีเมล และชื่อที่เหมือนกัน — รวมแล้วดีลและกิจกรรมย้ายมาอยู่ที่รายการที่เก็บไว้`} />
      <ModuleTabs items={crmNavItems(id)} />
      {pairs.length === 0 ? (
        <p className="card p-4 text-sm text-[color:var(--color-muted)]" data-testid="crm-dup-empty">
          ไม่พบผู้ติดต่อที่น่าจะซ้ำในส่วนที่คุณดูแล
        </p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2" data-testid="crm-dup-list">
          {pairs.map((p) => (
            <li key={`${p.a.id}-${p.b.id}`} className="card grid min-w-0 grid-cols-1 items-center gap-2 p-3 md:grid-cols-[1fr_1fr_auto_auto] md:gap-4">
              <Link href={`${base}/${p.a.id}`} className="min-w-0 truncate text-sm font-medium" data-testid="crm-contact-dup-a">
                {p.a.name}
              </Link>
              <Link href={`${base}/${p.b.id}`} className="min-w-0 truncate text-sm font-medium" data-testid="crm-contact-dup-b">
                {p.b.name}
              </Link>
              <span className="text-xs text-[color:var(--color-muted)]">{p.reason}</span>
              <MergePairSheet kind="contact" systemId={id} a={p.a} b={p.b} fields={fields} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
